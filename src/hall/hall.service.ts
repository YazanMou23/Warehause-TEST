import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHallDto } from './dto/create-hall.dto';
import { UpdateHallDto } from './dto/update-hall.dto';

@Injectable()
export class HallService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createHallDto: CreateHallDto, actorId?: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: createHallDto.warehouseId, deletedAt: null },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID ${createHallDto.warehouseId} not found`);
    }

    const hall = await this.prisma.hall.create({
      data: {
        name: createHallDto.name,
        warehouseId: createHallDto.warehouseId,
        capacity: createHallDto.capacity || null,
        color: createHallDto.color || "#1d4ed8",
      },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'CREATE_HALL',
        details: `Created hall ${hall.name} in warehouse ${warehouse.name} (ID: ${hall.id})`,
      },
    });

    return hall;
  }

  async findAll(page = 1, limit = 10, warehouseId?: string) {
    const skip = (page - 1) * limit;
    const where: any = { deletedAt: null };
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.hall.count({ where }),
      this.prisma.hall.findMany({
        where,
        include: {
          warehouse: true,
          containers: {
            where: { deletedAt: null },
          },
          users: {
            where: { deletedAt: null, isActive: true },
          },
        },
        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const hall = await this.prisma.hall.findFirst({
      where: { id, deletedAt: null },
      include: {
        warehouse: true,
      },
    });

    if (!hall) {
      throw new NotFoundException(`Hall with ID ${id} not found`);
    }

    return hall;
  }

  async getOverview(id: string) {
    const hall = await this.prisma.hall.findFirst({
      where: { id, deletedAt: null },
      include: {
        warehouse: true,
      },
    });

    if (!hall) {
      throw new NotFoundException(`Hall with ID ${id} not found`);
    }

    // Get active employees assigned to this hall
    const employees = await this.prisma.user.findMany({
      where: {
        hallId: id,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        telegramId: true,
      },
    });

    // Get active containers currently in this hall
    const containers = await this.prisma.container.findMany({
      where: {
        hallId: id,
        deletedAt: null,
      },
    });

    return {
      hall: {
        id: hall.id,
        name: hall.name,
        capacity: hall.capacity,
        warehouse: hall.warehouse,
      },
      assignedEmployees: employees,
      activeContainers: containers,
      currentContainerCount: containers.length,
      occupancyPercentage: hall.capacity
        ? Math.round((containers.length / hall.capacity) * 100)
        : null,
    };
  }

  async update(id: string, updateHallDto: UpdateHallDto, actorId?: string) {
    const hall = await this.prisma.hall.findFirst({
      where: { id, deletedAt: null },
    });

    if (!hall) {
      throw new NotFoundException(`Hall with ID ${id} not found`);
    }

    if (updateHallDto.warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: updateHallDto.warehouseId, deletedAt: null },
      });
      if (!warehouse) {
        throw new NotFoundException(`Warehouse with ID ${updateHallDto.warehouseId} not found`);
      }
    }

    const updated = await this.prisma.hall.update({
      where: { id },
      data: updateHallDto,
      include: {
        warehouse: true,
        containers: {
          where: { deletedAt: null },
        },
        users: {
          where: { deletedAt: null, isActive: true },
        },
      },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'UPDATE_HALL',
        details: `Updated hall ${updated.name} (ID: ${updated.id})`,
      },
    });

    return updated;
  }

  async deactivate(id: string, actorId?: string) {
    const hall = await this.prisma.hall.findFirst({
      where: { id, deletedAt: null },
    });

    if (!hall) {
      throw new NotFoundException(`Hall with ID ${id} not found`);
    }

    const updated = await this.prisma.hall.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Unassign users from this hall
    await this.prisma.user.updateMany({
      where: { hallId: id },
      data: { hallId: null },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'DEACTIVATE_HALL',
        details: `Soft deleted hall ${updated.name} (ID: ${updated.id})`,
      },
    });

    return { message: 'Hall deactivated successfully' };
  }
}
