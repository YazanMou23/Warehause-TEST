import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private normalizeDate(dateStr: string): Date {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      throw new BadRequestException('Invalid date string format');
    }
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  async create(createPlanDto: CreatePlanDto, actorId?: string) {
    const normalizedDate = this.normalizeDate(createPlanDto.date);

    // Verify warehouse & hall
    const hall = await this.prisma.hall.findFirst({
      where: {
        id: createPlanDto.hallId,
        warehouseId: createPlanDto.warehouseId,
        deletedAt: null,
      },
    });

    if (!hall) {
      throw new NotFoundException('Specified hall does not exist in the specified warehouse');
    }

    // Check if plan already exists for this date, warehouse, and hall
    const existing = await this.prisma.plan.findFirst({
      where: {
        date: normalizedDate,
        warehouseId: createPlanDto.warehouseId,
        hallId: createPlanDto.hallId,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException('A daily plan already exists for this date, warehouse, and hall');
    }

    // Run transaction
    const plan = await this.prisma.$transaction(async (tx) => {
      // 1. Create plan
      const newPlan = await tx.plan.create({
        data: {
          date: normalizedDate,
          warehouseId: createPlanDto.warehouseId,
          hallId: createPlanDto.hallId,
          title: createPlanDto.title || null,
          description: createPlanDto.description || null,
        },
      });

      // 2. Assign employees
      if (createPlanDto.assignedEmployeeIds && createPlanDto.assignedEmployeeIds.length > 0) {
        await tx.planEmployee.createMany({
          data: createPlanDto.assignedEmployeeIds.map((empId) => ({
            planId: newPlan.id,
            employeeId: empId,
          })),
        });
      }

      // 3. Assign containers
      if (createPlanDto.assignedContainerIds && createPlanDto.assignedContainerIds.length > 0) {
        await tx.planContainer.createMany({
          data: createPlanDto.assignedContainerIds.map((cId) => ({
            planId: newPlan.id,
            containerId: cId,
          })),
        });
      }

      return newPlan;
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'CREATE_PLAN',
        details: `Created daily plan (ID: ${plan.id}) for date ${normalizedDate.toISOString().split('T')[0]} at warehouse ${plan.warehouseId}, hall ${plan.hallId}`,
      },
    });

    const fullPlan = await this.findOne(plan.id);

    // Send email notifications asynchronously
    if (fullPlan.assignedEmployees && fullPlan.assignedEmployees.length > 0) {
      const employeesWithEmail = fullPlan.assignedEmployees.filter((e: any) => e.email);
      this.logger.log(
        `Plan created: ${fullPlan.assignedEmployees.length} employee(s) assigned, ` +
        `${employeesWithEmail.length} with email address(es). Sending notifications...`
      );

      for (const employee of fullPlan.assignedEmployees) {
        if (employee.email) {
          this.logger.log(`Sending plan notification to ${employee.name} <${employee.email}>`);
          const emailDetails = {
            employeeName: employee.name,
            date: new Date(fullPlan.date).toLocaleDateString('de-DE', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            }),
            warehouseName: fullPlan.warehouseName,
            hallName: fullPlan.hallName,
            title: fullPlan.title || 'Schichtplan Zuweisung',
            description: fullPlan.description || 'Sie wurden einer neuen Schicht zugewiesen.',
            containers: fullPlan.assignedContainers.map((c: any) => c.containerNumber),
          };
          this.emailService.sendPlanNotification(employee.email, emailDetails)
            .then((sent) => {
              if (sent) {
                this.logger.log(`✓ Email sent to ${employee.name} (${employee.email})`);
              } else {
                this.logger.warn(`✗ Email failed for ${employee.name} (${employee.email})`);
              }
              this.prisma.actionLog.create({
                data: {
                  userId: actorId || null,
                  action: sent ? 'EMAIL_NOTIFICATION' : 'EMAIL_NOTIFICATION_FAILED',
                  details: sent
                    ? `Plan notification email sent to ${employee.name} (${employee.email})`
                    : `Failed to send plan notification to ${employee.name} (${employee.email})`,
                },
              }).catch(() => {});
            })
            .catch((err) => {
              this.logger.error(`Email error for ${employee.email}: ${err.message}`);
            });
        } else {
          this.logger.debug(`Skipping ${employee.name} — no email address on record.`);
        }
      }
    } else {
      this.logger.log('Plan created with no assigned employees — no emails to send.');
    }

    return fullPlan;
  }

  async update(id: string, updatePlanDto: UpdatePlanDto, actorId?: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { id, deletedAt: null },
    });

    if (!plan) {
      throw new NotFoundException(`Daily plan with ID ${id} not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      // Update plan properties
      const updateData: any = {};
      if (updatePlanDto.title !== undefined) updateData.title = updatePlanDto.title;
      if (updatePlanDto.description !== undefined) updateData.description = updatePlanDto.description;
      
      if (Object.keys(updateData).length > 0) {
        await tx.plan.update({
          where: { id },
          data: updateData,
        });
      }

      // Update employee assignments
      if (updatePlanDto.assignedEmployeeIds !== undefined) {
        // Clear old ones
        await tx.planEmployee.deleteMany({
          where: { planId: id },
        });

        // Insert new ones
        if (updatePlanDto.assignedEmployeeIds.length > 0) {
          await tx.planEmployee.createMany({
            data: updatePlanDto.assignedEmployeeIds.map((empId) => ({
              planId: id,
              employeeId: empId,
            })),
          });
        }
      }

      // Update container assignments
      if (updatePlanDto.assignedContainerIds !== undefined) {
        // Clear old ones
        await tx.planContainer.deleteMany({
          where: { planId: id },
        });

        // Insert new ones
        if (updatePlanDto.assignedContainerIds.length > 0) {
          await tx.planContainer.createMany({
            data: updatePlanDto.assignedContainerIds.map((cId) => ({
              planId: id,
              containerId: cId,
            })),
          });
        }
      }
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'UPDATE_PLAN',
        details: `Updated daily plan (ID: ${id}) assignments`,
      },
    });

    return this.findOne(id);
  }

  async findOne(id: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { id, deletedAt: null },
      include: {
        warehouse: { select: { name: true } },
        hall: { select: { name: true } },
        assignedEmployees: {
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                role: true,
                telegramId: true,
              },
            },
          },
        },
        assignedContainers: {
          include: {
            container: true,
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException(`Daily plan with ID ${id} not found`);
    }

    // Format output to be clean
    return {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      date: plan.date,
      warehouseId: plan.warehouseId,
      warehouseName: plan.warehouse.name,
      hallId: plan.hallId,
      hallName: plan.hall.name,
      assignedEmployees: plan.assignedEmployees.map((ae) => ae.employee),
      assignedContainers: plan.assignedContainers.map((ac) => ac.container),
    };
  }

  async findByDateAndWarehouse(dateStr: string, warehouseId?: string) {
    const normalizedDate = this.normalizeDate(dateStr);

    const where: any = {
      date: normalizedDate,
      deletedAt: null,
    };
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    const plans = await this.prisma.plan.findMany({
      where,
      include: {
        warehouse: { select: { name: true } },
        hall: { select: { name: true } },
        assignedEmployees: {
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                role: true,
                telegramId: true,
              },
            },
          },
        },
        assignedContainers: {
          include: {
            container: true,
          },
        },
      },
    });

    return plans.map((plan) => ({
      id: plan.id,
      title: plan.title,
      description: plan.description,
      date: plan.date,
      warehouseId: plan.warehouseId,
      warehouseName: plan.warehouse.name,
      hallId: plan.hallId,
      hallName: plan.hall.name,
      assignedEmployees: plan.assignedEmployees.map((ae) => ae.employee),
      assignedContainers: plan.assignedContainers.map((ac) => ac.container),
    }));
  }

  async deactivate(id: string, actorId?: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { id, deletedAt: null },
    });

    if (!plan) {
      throw new NotFoundException(`Daily plan with ID ${id} not found`);
    }

    await this.prisma.plan.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'DEACTIVATE_PLAN',
        details: `Soft deleted daily plan (ID: ${id})`,
      },
    });

    return { message: 'Daily plan deactivated successfully' };
  }

  async findAll(page = 1, limit = 10, startDateStr?: string, endDateStr?: string, warehouseId?: string) {
    const skip = (page - 1) * limit;
    const where: any = {
      deletedAt: null,
    };

    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    if (startDateStr || endDateStr) {
      where.date = {};
      if (startDateStr) {
        where.date.gte = this.normalizeDate(startDateStr);
      }
      if (endDateStr) {
        where.date.lte = this.normalizeDate(endDateStr);
      }
    }

    const [total, plans] = await this.prisma.$transaction([
      this.prisma.plan.count({ where }),
      this.prisma.plan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          warehouse: { select: { name: true } },
          hall: { select: { name: true } },
          assignedEmployees: {
            include: {
              employee: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true,
                  profilePhoto: true,
                  role: true,
                  telegramId: true,
                },
              },
            },
          },
          assignedContainers: {
            include: {
              container: true,
            },
          },
        },
      }),
    ]);

    const formattedPlans = plans.map((plan) => ({
      id: plan.id,
      title: plan.title,
      description: plan.description,
      date: plan.date,
      warehouseId: plan.warehouseId,
      warehouseName: plan.warehouse.name,
      hallId: plan.hallId,
      hallName: plan.hall.name,
      assignedEmployees: plan.assignedEmployees.map((ae) => ae.employee),
      assignedContainers: plan.assignedContainers.map((ac) => ac.container),
    }));

    return {
      data: formattedPlans,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async bulkDeactivate(ids: string[], actorId?: string) {
    const plans = await this.prisma.plan.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    if (plans.length === 0) {
      throw new NotFoundException('No active daily plans found for the provided IDs');
    }

    const result = await this.prisma.plan.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        deletedAt: new Date(),
      },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'BULK_DEACTIVATE_PLAN',
        details: `Soft deleted / Deactivated ${result.count} daily plans`,
      },
    });

    return { message: `${result.count} daily plans deactivated successfully` };
  }
}
