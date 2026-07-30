import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { EmailService } from '../email/email.service';
import { MessagingService } from '../messaging/messaging.service';

@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly messagingService: MessagingService,
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
          shift: createPlanDto.shift || null,
          notes: createPlanDto.notes || null,
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
      const containerIdsToLink = new Set<string>();

      if (createPlanDto.assignedContainerIds && createPlanDto.assignedContainerIds.length > 0) {
        createPlanDto.assignedContainerIds.forEach((cId) => containerIdsToLink.add(cId));
      }

      if (createPlanDto.assignedContainerNumbers && createPlanDto.assignedContainerNumbers.length > 0) {
        for (const num of createPlanDto.assignedContainerNumbers) {
          const cleanNum = num.trim().toUpperCase();
          if (!cleanNum) continue;

          let container = await tx.container.findFirst({
            where: {
              containerNumber: cleanNum,
              deletedAt: null,
            },
          });

          if (!container) {
            container = await tx.container.create({
              data: {
                containerNumber: cleanNum,
                warehouseId: createPlanDto.warehouseId,
                hallId: createPlanDto.hallId,
                status: 'EMPTY',
              },
            });
          }

          containerIdsToLink.add(container.id);
        }
      }

      if (containerIdsToLink.size > 0) {
        await tx.planContainer.createMany({
          data: Array.from(containerIdsToLink).map((cId) => ({
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
        details: `Created daily plan for date ${normalizedDate.toISOString().split('T')[0]} in warehouse ${plan.warehouseId}, hall ${plan.hallId}`,
      },
    });

    const fullPlan = await this.findOne(plan.id);

    // Trigger Notification, Emails & WhatsApp for assigned employees
    await this.notifyAssignedEmployees(fullPlan, fullPlan.assignedEmployees, false, actorId);

    return fullPlan;
  }

  private async notifyAssignedEmployees(
    plan: {
      id: string;
      date: Date;
      warehouseName: string;
      hallName: string;
      shift?: string | null;
      notes?: string | null;
      title?: string | null;
    },
    employees: Array<{ id: string; name: string; email?: string | null; phone?: string | null }>,
    isUpdate = false,
    actorId?: string,
  ) {
    if (!employees || employees.length === 0) return;

    const formattedDate = new Date(plan.date).toLocaleDateString('de-DE');
    const headerTitle = isUpdate ? 'Schichtplan aktualisiert' : 'Neue Schichtzuweisung';

    // Fetch employee Treffpunkt details
    const userRecords = await this.prisma.user.findMany({
      where: { id: { in: employees.map((e) => e.id) } },
      select: { id: true, treffpunkt: true, treffpunktTime: true, address: true },
    }).catch(() => []);
    const userMap = new Map(userRecords.map((u) => [u.id, u]));

    for (const employee of employees) {
      const uInfo = userMap.get(employee.id);
      const tpOrt = uInfo?.treffpunkt || uInfo?.address || 'Kein Treffpunkt angegeben';
      const tpZeit = uInfo?.treffpunktTime || 'Keine Uhrzeit angegeben';

      // 1. App Notification
      await this.prisma.notification.create({
        data: {
          userId: employee.id,
          title: headerTitle,
          message: isUpdate
            ? `Ihr Schichtplan am ${formattedDate} in Halle ${plan.hallName} wurde aktualisiert. Treffpunkt: ${tpOrt} (${tpZeit})`
            : `Sie wurden einer Schicht am ${formattedDate} in Halle ${plan.hallName} zugewiesen. Treffpunkt: ${tpOrt} (${tpZeit})`,
          type: isUpdate ? 'PLAN_UPDATED' : 'PLAN_CREATED',
        },
      }).catch((err) => {
        this.logger.error(`Notification DB error for user ${employee.id}: ${err.message}`);
      });

      // 2. Email Notification
      if (employee.email) {
        const emailSubject = `${headerTitle} - ${formattedDate}`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
            <h3 style="color: #1e293b;">Hallo ${employee.name},</h3>
            <p style="color: #334155;">${isUpdate ? 'Ihr Schichtplan wurde aktualisiert:' : 'Sie wurden für eine neue Schicht eingeteilt:'}</p>
            <ul style="color: #334155; line-height: 1.6;">
              <li><strong>Datum:</strong> ${formattedDate}</li>
              <li><strong>Lager:</strong> ${plan.warehouseName}</li>
              <li><strong>Halle:</strong> ${plan.hallName}</li>
              <li><strong>Schicht:</strong> ${plan.shift || 'Standard'}</li>
              <li><strong>📍 Treffpunkt (Ort):</strong> ${tpOrt}</li>
              <li><strong>⏰ Treffpunkt-Uhrzeit:</strong> ${tpZeit}</li>
              ${plan.notes ? `<li><strong>Notizen:</strong> ${plan.notes}</li>` : ''}
            </ul>
            <p style="color: #64748b; font-size: 13px;">Bitte loggen Sie sich in das Portal ein, um weitere Details einzusehen.</p>
          </div>
        `;

        this.emailService.sendEmail(employee.email, emailSubject, emailHtml)
          .then((sent: any) => {
            this.prisma.actionLog.create({
              data: {
                userId: actorId || null,
                action: sent ? 'EMAIL_NOTIFICATION' : 'EMAIL_NOTIFICATION_FAILED',
                details: sent
                  ? `Plan notification email sent to ${employee.name} (${employee.email})`
                  : `Failed to send plan notification email to ${employee.name} (${employee.email})`,
              },
            }).catch(() => {});
          })
          .catch((err: any) => {
            this.logger.error(`Email error for ${employee.email}: ${err.message}`);
          });
      }

      // 3. WhatsApp Notification
      if (employee.phone) {
        const waMessage = `Hallo ${employee.name},\n${isUpdate ? 'Ihr Schichtplan wurde aktualisiert:' : 'Sie wurden für eine neue Schicht eingeteilt:'}\n\n📅 Datum: ${formattedDate}\n🏢 Lager: ${plan.warehouseName}\n📍 Halle: ${plan.hallName}\n🕒 Schicht: ${plan.shift || 'Standard'}\n📍 Treffpunkt: ${tpOrt}\n⏰ Treffpunkt-Uhrzeit: ${tpZeit}${plan.notes ? `\n📝 Notizen: ${plan.notes}` : ''}\n\nBitte loggen Sie sich in das Portal ein für weitere Details.`;

        this.messagingService.sendWhatsAppDirect(employee.phone, waMessage)
          .then((res) => {
            this.prisma.actionLog.create({
              data: {
                userId: actorId || null,
                action: res.success ? 'WHATSAPP_NOTIFICATION' : 'WHATSAPP_NOTIFICATION_FAILED',
                details: res.success
                  ? `Plan notification WhatsApp sent to ${employee.name} (${employee.phone})`
                  : `Failed WhatsApp notification to ${employee.name} (${employee.phone}): ${res.error || 'Unknown error'}`,
              },
            }).catch(() => {});
          })
          .catch((err: any) => {
            this.logger.error(`WhatsApp error for ${employee.phone}: ${err.message}`);
          });
      }
    }
  }

  async update(id: string, updatePlanDto: UpdatePlanDto, actorId?: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { id, deletedAt: null },
      include: {
        assignedEmployees: true,
        hall: true,
      },
    });

    if (!plan) {
      throw new NotFoundException(`Daily plan with ID ${id} not found`);
    }

    const prevEmployeeIds = plan.assignedEmployees.map((ae) => ae.employeeId);

    await this.prisma.$transaction(async (tx) => {
      // Update plan properties
      const updateData: any = {};
      if (updatePlanDto.title !== undefined) updateData.title = updatePlanDto.title;
      if (updatePlanDto.description !== undefined) updateData.description = updatePlanDto.description;
      if (updatePlanDto.shift !== undefined) updateData.shift = updatePlanDto.shift;
      if (updatePlanDto.notes !== undefined) updateData.notes = updatePlanDto.notes;

      if (Object.keys(updateData).length > 0) {
        await tx.plan.update({
          where: { id },
          data: updateData,
        });
      }

      // Update employee assignments
      if (updatePlanDto.assignedEmployeeIds !== undefined) {
        await tx.planEmployee.deleteMany({
          where: { planId: id },
        });

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
      if (updatePlanDto.assignedContainerIds !== undefined || updatePlanDto.assignedContainerNumbers !== undefined) {
        await tx.planContainer.deleteMany({
          where: { planId: id },
        });

        const containerIdsToLink = new Set<string>();

        if (updatePlanDto.assignedContainerIds && updatePlanDto.assignedContainerIds.length > 0) {
          updatePlanDto.assignedContainerIds.forEach((cId) => containerIdsToLink.add(cId));
        }

        if (updatePlanDto.assignedContainerNumbers && updatePlanDto.assignedContainerNumbers.length > 0) {
          for (const num of updatePlanDto.assignedContainerNumbers) {
            const cleanNum = num.trim().toUpperCase();
            if (!cleanNum) continue;

            let container = await tx.container.findFirst({
              where: {
                containerNumber: cleanNum,
                deletedAt: null,
              },
            });

            if (!container) {
              container = await tx.container.create({
                data: {
                  containerNumber: cleanNum,
                  warehouseId: plan.warehouseId,
                  hallId: plan.hallId,
                  status: 'EMPTY',
                },
              });
            }

            containerIdsToLink.add(container.id);
          }
        }

        if (containerIdsToLink.size > 0) {
          await tx.planContainer.createMany({
            data: Array.from(containerIdsToLink).map((cId) => ({
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

    const updatedPlan = await this.findOne(id);

    // Notify Employees of plan updates via App, Email & WhatsApp
    await this.notifyAssignedEmployees(updatedPlan, updatedPlan.assignedEmployees, true, actorId);

    return updatedPlan;
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

    return {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      date: plan.date,
      warehouseId: plan.warehouseId,
      warehouseName: plan.warehouse.name,
      hallId: plan.hallId,
      hallName: plan.hall.name,
      shift: plan.shift,
      notes: plan.notes,
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
      shift: plan.shift,
      notes: plan.notes,
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

  async findAll(page = 1, limit = 100, startDateStr?: string, endDateStr?: string, warehouseId?: string) {
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
      shift: plan.shift,
      notes: plan.notes,
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

  async bulkDuplicate(ids: string[], actorId?: string) {
    const plans = await this.prisma.plan.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: { assignedEmployees: true, assignedContainers: true },
    });

    let count = 0;
    for (const plan of plans) {
      const nextDay = new Date(plan.date);
      nextDay.setDate(nextDay.getDate() + 1);

      // Check unique constraint: date + warehouseId + hallId
      const exists = await this.prisma.plan.findFirst({
        where: {
          date: nextDay,
          warehouseId: plan.warehouseId,
          hallId: plan.hallId,
          deletedAt: null,
        },
      });

      if (exists) continue;

      await this.prisma.$transaction(async (tx) => {
        const newPlan = await tx.plan.create({
          data: {
            date: nextDay,
            warehouseId: plan.warehouseId,
            hallId: plan.hallId,
            title: plan.title ? `${plan.title} (Kopie)` : null,
            description: plan.description,
            shift: plan.shift,
            notes: plan.notes,
          },
        });

        if (plan.assignedEmployees.length > 0) {
          await tx.planEmployee.createMany({
            data: plan.assignedEmployees.map((emp) => ({
              planId: newPlan.id,
              employeeId: emp.employeeId,
            })),
          });
        }
        count++;
      });
    }

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'BULK_DUPLICATE_PLAN',
        details: `Duplicated ${count} daily plans to next day`,
      },
    });

    return { message: `${count} daily plans duplicated successfully` };
  }

  async bulkChangeHall(ids: string[], hallId: string, actorId?: string) {
    const hall = await this.prisma.hall.findFirst({
      where: { id: hallId, deletedAt: null },
    });

    if (!hall) {
      throw new NotFoundException(`Hall with ID ${hallId} not found`);
    }

    const plans = await this.prisma.plan.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });

    let count = 0;
    for (const plan of plans) {
      // Check unique constraint
      const exists = await this.prisma.plan.findFirst({
        where: {
          date: plan.date,
          warehouseId: hall.warehouseId,
          hallId,
          deletedAt: null,
        },
      });

      if (exists) continue;

      await this.prisma.plan.update({
        where: { id: plan.id },
        data: {
          hallId,
          warehouseId: hall.warehouseId,
        },
      });
      count++;
    }

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'BULK_CHANGE_HALL_PLAN',
        details: `Changed hall for ${count} plans to ${hall.name}`,
      },
    });

    return { message: `Hall updated for ${count} daily plans successfully` };
  }

  async bulkChangeShift(ids: string[], shift: string, actorId?: string) {
    const result = await this.prisma.plan.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { shift },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'BULK_CHANGE_SHIFT_PLAN',
        details: `Bulk updated shift for ${result.count} plans to ${shift}`,
      },
    });

    return { message: `Shift updated for ${result.count} daily plans successfully` };
  }

  async bulkAssignEmployees(ids: string[], employeeIds: string[], actorId?: string) {
    const plans = await this.prisma.plan.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });

    for (const plan of plans) {
      await this.prisma.$transaction(async (tx) => {
        // Clear existing
        await tx.planEmployee.deleteMany({
          where: { planId: plan.id },
        });

        // Assign new
        if (employeeIds.length > 0) {
          await tx.planEmployee.createMany({
            data: employeeIds.map((empId) => ({
              planId: plan.id,
              employeeId: empId,
            })),
          });
        }
      });

      const updatedPlan = await this.findOne(plan.id);
      await this.notifyAssignedEmployees(updatedPlan, updatedPlan.assignedEmployees, true, actorId);
    }

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'BULK_ASSIGN_EMPLOYEES_PLAN',
        details: `Bulk assigned employees to ${plans.length} daily plans`,
      },
    });

    return { message: `Employees assigned to ${plans.length} daily plans successfully` };
  }
}
