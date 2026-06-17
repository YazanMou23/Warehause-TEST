import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContainerDto } from './dto/create-container.dto';
import { UpdateContainerDto } from './dto/update-container.dto';
import { BulkImportContainersDto } from './dto/bulk-import-containers.dto';

@Injectable()
export class ContainerService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createContainerDto: CreateContainerDto, actorId?: string) {
    // Check if container already exists
    const existing = await this.prisma.container.findFirst({
      where: {
        containerNumber: createContainerDto.containerNumber,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(`Container with number ${createContainerDto.containerNumber} already exists`);
    }

    // Verify warehouse & hall exist
    const hall = await this.prisma.hall.findFirst({
      where: {
        id: createContainerDto.hallId,
        warehouseId: createContainerDto.warehouseId,
        deletedAt: null,
      },
    });

    if (!hall) {
      throw new NotFoundException('Specified hall does not exist in the specified warehouse');
    }

    const container = await this.prisma.container.create({
      data: {
        containerNumber: createContainerDto.containerNumber.toUpperCase(),
        status: createContainerDto.status,
        warehouseId: createContainerDto.warehouseId,
        hallId: createContainerDto.hallId,
        arrivalDate: createContainerDto.arrivalDate ? new Date(createContainerDto.arrivalDate) : new Date(),
      },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'CREATE_CONTAINER',
        details: `Created container ${container.containerNumber} (ID: ${container.id}) in warehouse ${container.warehouseId}, hall ${container.hallId}`,
      },
    });

    return container;
  }

  async bulkImport(bulkImportDto: BulkImportContainersDto, actorId?: string) {
    const results = [];
    const errors = [];

    // Run sequentially to ensure proper error tracking and validations
    for (const cDto of bulkImportDto.containers) {
      try {
        const result = await this.create(cDto, actorId);
        results.push(result);
      } catch (err: any) {
        errors.push({
          containerNumber: cDto.containerNumber,
          error: err.message || 'Unknown error during creation',
        });
      }
    }

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'BULK_IMPORT_CONTAINERS',
        details: `Bulk imported ${results.length} containers. ${errors.length} errors occurred.`,
      },
    });

    return {
      importedCount: results.length,
      failedCount: errors.length,
      imported: results,
      failed: errors,
    };
  }

  async findAll(page = 1, limit = 10, search?: string, warehouseId?: string, hallId?: string) {
    const skip = (page - 1) * limit;
    const where: any = { deletedAt: null };

    if (search) {
      where.containerNumber = {
        contains: search.toUpperCase(),
      };
    }

    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    if (hallId) {
      where.hallId = hallId;
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.container.count({ where }),
      this.prisma.container.findMany({
        where,
        include: {
          warehouse: { select: { name: true } },
          hall: { select: { name: true } },
        },
        skip,
        take: limit,
        orderBy: { arrivalDate: 'desc' },
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
    const container = await this.prisma.container.findFirst({
      where: { id, deletedAt: null },
      include: {
        warehouse: true,
        hall: true,
      },
    });

    if (!container) {
      throw new NotFoundException(`Container with ID ${id} not found`);
    }

    return container;
  }

  async update(id: string, updateContainerDto: UpdateContainerDto, actorId?: string) {
    const container = await this.prisma.container.findFirst({
      where: { id, deletedAt: null },
    });

    if (!container) {
      throw new NotFoundException(`Container with ID ${id} not found`);
    }

    // If changing location, verify new location
    if (updateContainerDto.warehouseId || updateContainerDto.hallId) {
      const wId = updateContainerDto.warehouseId || container.warehouseId;
      const hId = updateContainerDto.hallId || container.hallId;

      const hall = await this.prisma.hall.findFirst({
        where: {
          id: hId,
          warehouseId: wId,
          deletedAt: null,
        },
      });

      if (!hall) {
        throw new BadRequestException('Specified hall does not exist in the specified warehouse');
      }
    }

    const updated = await this.prisma.container.update({
      where: { id },
      data: updateContainerDto,
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'UPDATE_CONTAINER',
        details: `Updated container ${updated.containerNumber} (ID: ${updated.id})`,
      },
    });

    return updated;
  }

  async deactivate(id: string, actorId?: string) {
    const container = await this.prisma.container.findFirst({
      where: { id, deletedAt: null },
    });

    if (!container) {
      throw new NotFoundException(`Container with ID ${id} not found`);
    }

    const updated = await this.prisma.container.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'DEACTIVATE_CONTAINER',
        details: `Soft deleted container ${updated.containerNumber} (ID: ${updated.id})`,
      },
    });

    return { message: 'Container deactivated successfully' };
  }
}
