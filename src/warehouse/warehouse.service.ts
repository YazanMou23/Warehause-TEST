import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createWarehouseDto: CreateWarehouseDto, actorId?: string) {
    const existing = await this.prisma.warehouse.findUnique({
      where: { name: createWarehouseDto.name },
    });

    if (existing && existing.deletedAt === null) {
      throw new ConflictException('A warehouse with this name already exists');
    }

    // If it was soft-deleted, we can restore it, or create a new one
    let warehouse;
    if (existing) {
      warehouse = await this.prisma.warehouse.update({
        where: { name: createWarehouseDto.name },
        data: { deletedAt: null },
      });
    } else {
      warehouse = await this.prisma.warehouse.create({
        data: { name: createWarehouseDto.name },
      });
    }

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'CREATE_WAREHOUSE',
        details: `Created warehouse ${warehouse.name} (ID: ${warehouse.id})`,
      },
    });

    return warehouse;
  }

  async findAll(page = 1, limit = 1000) {
    const skip = (page - 1) * limit;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.warehouse.count({ where: { deletedAt: null } }),
      this.prisma.warehouse.findMany({
        where: { deletedAt: null },
        include: {
          halls: {
            where: { deletedAt: null },
            include: {
              containers: {
                where: { deletedAt: null },
              },
              users: {
                where: { deletedAt: null, isActive: true },
                select: {
                  id: true,
                  name: true,
                  role: true,
                },
              },
            },
          },
          containers: {
            where: { deletedAt: null },
          },
          users: {
            where: { deletedAt: null, isActive: true },
            select: {
              id: true,
              name: true,
              role: true,
            },
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
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, deletedAt: null },
      include: {
        halls: {
          where: { deletedAt: null },
          include: {
            containers: {
              where: { deletedAt: null },
            },
            users: {
              where: { deletedAt: null, isActive: true },
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        },
        containers: {
          where: { deletedAt: null },
        },
        users: {
          where: { deletedAt: null, isActive: true },
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID ${id} not found`);
    }

    return warehouse;
  }

  async update(id: string, updateWarehouseDto: UpdateWarehouseDto, actorId?: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, deletedAt: null },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID ${id} not found`);
    }

    if (updateWarehouseDto.name) {
      const existing = await this.prisma.warehouse.findFirst({
        where: {
          name: updateWarehouseDto.name,
          id: { not: id },
          deletedAt: null,
        },
      });
      if (existing) {
        throw new ConflictException('A warehouse with this name already exists');
      }
    }

    const updated = await this.prisma.warehouse.update({
      where: { id },
      data: updateWarehouseDto,
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'UPDATE_WAREHOUSE',
        details: `Updated warehouse ${updated.name} (ID: ${updated.id})`,
      },
    });

    return updated;
  }

  async deactivate(id: string, actorId?: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, deletedAt: null },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID ${id} not found`);
    }

    const updated = await this.prisma.warehouse.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Also soft-delete all associated halls
    await this.prisma.hall.updateMany({
      where: { warehouseId: id },
      data: { deletedAt: new Date() },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'DEACTIVATE_WAREHOUSE',
        details: `Soft deleted warehouse ${updated.name} (ID: ${updated.id}) and its halls`,
      },
    });

    return { message: 'Warehouse deactivated successfully' };
  }
}
