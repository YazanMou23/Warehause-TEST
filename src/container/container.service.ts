import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContainerDto } from './dto/create-container.dto';
import { UpdateContainerDto } from './dto/update-container.dto';
import { BulkImportContainersDto } from './dto/bulk-import-containers.dto';

@Injectable()
export class ContainerService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createContainerDto: CreateContainerDto, actorId?: string) {
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

    const { assignedEmployeeIds, ...directData } = createContainerDto;

    const container = await this.prisma.$transaction(async (tx) => {
      const containerObj = await tx.container.create({
        data: {
          containerNumber: directData.containerNumber.toUpperCase(),
          status: directData.status,
          warehouseId: directData.warehouseId,
          hallId: directData.hallId,
          arrivalDate: directData.arrivalDate ? new Date(directData.arrivalDate) : new Date(),
          workedHours: directData.workedHours !== undefined ? directData.workedHours : 0,
          notes: directData.notes || null,
          createdById: actorId || null,
          updatedById: actorId || null,
        },
      });

      if (assignedEmployeeIds && assignedEmployeeIds.length > 0) {
        await tx.containerEmployee.createMany({
          data: assignedEmployeeIds.map((empId) => ({
            containerId: containerObj.id,
            employeeId: empId,
          })),
        });
      }

      return containerObj;
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'CREATE_CONTAINER',
        details: `Created worked container ${container.containerNumber} (ID: ${container.id}) in warehouse ${container.warehouseId}, hall ${container.hallId}`,
      },
    });

    return container;
  }

  async bulkImport(bulkImportDto: BulkImportContainersDto, actorId?: string) {
    const results = [];
    const errors = [];

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
          employees: {
            include: {
              employee: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                },
              },
            },
          },
          createdBy: { select: { name: true } },
          updatedBy: { select: { name: true } },
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
        employees: {
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                role: true,
                phone: true,
              },
            },
          },
        },
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
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
      include: {
        employees: true,
      },
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

    const { assignedEmployeeIds, ...directData } = updateContainerDto;

    const updated = await this.prisma.$transaction(async (tx) => {
      const containerObj = await tx.container.update({
        where: { id },
        data: {
          ...directData,
          updatedById: actorId || null,
        },
      });

      if (assignedEmployeeIds !== undefined) {
        // Clear old ones
        await tx.containerEmployee.deleteMany({
          where: { containerId: id },
        });

        // Insert new ones
        if (assignedEmployeeIds.length > 0) {
          await tx.containerEmployee.createMany({
            data: assignedEmployeeIds.map((empId) => ({
              containerId: id,
              employeeId: empId,
            })),
          });
        }
      }

      return containerObj;
    });

    // Create detailed audit trail changes
    const changes = [];
    if (updateContainerDto.status && updateContainerDto.status !== container.status) {
      changes.push(`status to ${updateContainerDto.status}`);
    }
    if (updateContainerDto.workedHours !== undefined && updateContainerDto.workedHours !== container.workedHours) {
      changes.push(`worked hours to ${updateContainerDto.workedHours}`);
    }
    if (updateContainerDto.notes !== undefined && updateContainerDto.notes !== container.notes) {
      changes.push(`notes updated`);
    }
    if (updateContainerDto.warehouseId && updateContainerDto.warehouseId !== container.warehouseId) {
      changes.push(`relocated warehouse`);
    }
    if (updateContainerDto.hallId && updateContainerDto.hallId !== container.hallId) {
      changes.push(`relocated hall`);
    }
    if (assignedEmployeeIds !== undefined) {
      changes.push(`updated assigned employees`);
    }

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'UPDATE_CONTAINER',
        details: `Updated container ${container.containerNumber} (${container.id}): ${changes.join(', ') || 'no changes'}`,
      },
    });

    return this.findOne(id);
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

  async getAuditTrail(id: string) {
    const container = await this.prisma.container.findFirst({
      where: { id, deletedAt: null },
    });

    if (!container) {
      throw new NotFoundException(`Container with ID ${id} not found`);
    }

    return this.prisma.actionLog.findMany({
      where: {
        details: {
          contains: id,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });
  }
}
