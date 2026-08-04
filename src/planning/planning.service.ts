import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { EmailService } from '../email/email.service';
import { MessagingService } from '../messaging/messaging.service';

@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);

  private readonly standardInclude = {
    locations: {
      include: {
        warehouse: { select: { name: true } },
        hall: { select: { name: true } },
      },
    },
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
  };

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

  private getShiftTimeWindow(
    date: Date,
    shift?: string | null,
    customStart?: string | Date,
    customEnd?: string | Date,
  ): { startTime: Date; endTime: Date } {
    if (customStart && customEnd) {
      const s = typeof customStart === 'string' ? new Date(customStart) : customStart;
      const e = typeof customEnd === 'string' ? new Date(customEnd) : customEnd;
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        return { startTime: s, endTime: e };
      }
    }
    const baseDate = new Date(date);
    baseDate.setUTCHours(0, 0, 0, 0);
    const startTime = new Date(baseDate);
    const endTime = new Date(baseDate);

    const sLower = (shift || '').toLowerCase();
    if (sLower.includes('spät') || sLower.includes('afternoon') || sLower.includes('second')) {
      startTime.setUTCHours(14, 0, 0, 0);
      endTime.setUTCHours(22, 0, 0, 0);
    } else if (sLower.includes('nacht') || sLower.includes('night') || sLower.includes('third')) {
      startTime.setUTCHours(22, 0, 0, 0);
      endTime.setDate(endTime.getDate() + 1);
      endTime.setUTCHours(6, 0, 0, 0);
    } else {
      // Frühschicht / Morning / default 06:00 - 14:00
      startTime.setUTCHours(6, 0, 0, 0);
      endTime.setUTCHours(14, 0, 0, 0);
    }
    return { startTime, endTime };
  }

  private formatPlanOutput(plan: any) {
    const primaryLocation = plan.locations && plan.locations.length > 0 ? plan.locations[0] : null;
    return {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      date: plan.date,
      startTime: plan.startTime,
      endTime: plan.endTime,
      warehouseId: primaryLocation ? primaryLocation.warehouseId : '',
      warehouseName: primaryLocation && primaryLocation.warehouse ? primaryLocation.warehouse.name : 'Unassigned',
      hallId: primaryLocation ? primaryLocation.hallId : '',
      hallName: primaryLocation && primaryLocation.hall ? primaryLocation.hall.name : 'Unassigned',
      locations: (plan.locations || []).map((loc: any) => ({
        id: loc.id,
        warehouseId: loc.warehouseId,
        warehouseName: loc.warehouse ? loc.warehouse.name : '',
        hallId: loc.hallId,
        hallName: loc.hall ? loc.hall.name : '',
        notes: loc.notes || null,
      })),
      shift: plan.shift,
      treffpunkt: plan.treffpunkt,
      treffpunktTime: plan.treffpunktTime,
      notes: plan.notes,
      assignedEmployees: (plan.assignedEmployees || []).map((ae: any) => ae.employee),
      assignedContainers: (plan.assignedContainers || []).map((ac: any) => ac.container),
    };
  }

  private async validateNoEmployeeTimeOverlap(
    tx: any,
    employeeIds: string[],
    startTime: Date,
    endTime: Date,
    excludePlanId?: string,
  ) {
    if (!employeeIds || employeeIds.length === 0) return;

    const where: any = {
      employeeId: { in: employeeIds },
      plan: {
        deletedAt: null,
      },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    };

    if (excludePlanId) {
      where.planId = { not: excludePlanId };
    }

    const conflictingAssignments = await tx.planEmployee.findMany({
      where,
      include: {
        employee: { select: { name: true, id: true } },
        plan: { select: { title: true, shift: true, date: true } },
      },
    });

    if (conflictingAssignments.length > 0) {
      const details = conflictingAssignments
        .map((ca: any) => {
          const empName = ca.employee?.name || ca.employeeId;
          const pTitle = ca.plan?.title || ca.plan?.shift || 'existing shift';
          const pDate = new Date(ca.plan?.date || ca.startTime).toLocaleDateString('de-DE');
          return `${empName} overlaps with ${pTitle} on ${pDate}`;
        })
        .join('; ');
      throw new ConflictException(`Shift time overlap detected for employee(s): ${details}`);
    }
  }

  async create(createPlanDto: CreatePlanDto, actorId?: string) {
    const normalizedDate = this.normalizeDate(createPlanDto.date);
    const { startTime, endTime } = this.getShiftTimeWindow(
      normalizedDate,
      createPlanDto.shift,
      createPlanDto.startTime,
      createPlanDto.endTime,
    );

    // Resolve target locations
    const targetLocations: { warehouseId: string; hallId: string; notes?: string }[] = [];
    if (createPlanDto.locations && createPlanDto.locations.length > 0) {
      targetLocations.push(...createPlanDto.locations);
    } else if (createPlanDto.warehouseId && createPlanDto.hallId) {
      targetLocations.push({ warehouseId: createPlanDto.warehouseId, hallId: createPlanDto.hallId });
    } else {
      throw new BadRequestException('At least one location (warehouse and hall) must be provided');
    }

    // Verify warehouses & halls exist
    for (const loc of targetLocations) {
      const hall = await this.prisma.hall.findFirst({
        where: {
          id: loc.hallId,
          warehouseId: loc.warehouseId,
          deletedAt: null,
        },
      });
      if (!hall) {
        throw new NotFoundException(`Specified hall (${loc.hallId}) does not exist in warehouse (${loc.warehouseId})`);
      }
    }

    // Run transaction with non-overlapping checks
    const plan = await this.prisma.$transaction(async (tx) => {
      if (createPlanDto.assignedEmployeeIds && createPlanDto.assignedEmployeeIds.length > 0) {
        await this.validateNoEmployeeTimeOverlap(tx, createPlanDto.assignedEmployeeIds, startTime, endTime);
      }

      // 1. Create plan
      const newPlan = await tx.plan.create({
        data: {
          date: normalizedDate,
          startTime,
          endTime,
          title: createPlanDto.title || null,
          description: createPlanDto.description || null,
          shift: createPlanDto.shift || null,
          treffpunkt: createPlanDto.treffpunkt || null,
          treffpunktTime: createPlanDto.treffpunktTime || null,
          notes: createPlanDto.notes || null,
        },
      });

      // 2. Assign locations
      await tx.planLocation.createMany({
        data: targetLocations.map((loc) => ({
          planId: newPlan.id,
          warehouseId: loc.warehouseId,
          hallId: loc.hallId,
          notes: loc.notes || null,
        })),
      });

      // 3. Assign employees with temporal boundaries
      if (createPlanDto.assignedEmployeeIds && createPlanDto.assignedEmployeeIds.length > 0) {
        await tx.planEmployee.createMany({
          data: createPlanDto.assignedEmployeeIds.map((empId) => ({
            planId: newPlan.id,
            employeeId: empId,
            startTime,
            endTime,
          })),
        });
      }

      // 4. Assign containers
      const containerIdsToLink = new Set<string>();

      if (createPlanDto.assignedContainerIds && createPlanDto.assignedContainerIds.length > 0) {
        createPlanDto.assignedContainerIds.forEach((cId) => containerIdsToLink.add(cId));
      }

      if (createPlanDto.assignedContainerNumbers && createPlanDto.assignedContainerNumbers.length > 0) {
        const primaryLoc = targetLocations[0];
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
                warehouseId: primaryLoc.warehouseId,
                hallId: primaryLoc.hallId,
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

    const fullPlan = await this.findOne(plan.id);

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'CREATE_PLAN',
        details: `Created daily plan for date ${normalizedDate.toISOString().split('T')[0]} across ${fullPlan.locations.length} location(s)`,
      },
    });

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
      treffpunkt?: string | null;
      treffpunktTime?: string | null;
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

    const userRecords = await this.prisma.user
      .findMany({
        where: { id: { in: employees.map((e) => e.id) } },
        select: { id: true, name: true, email: true, phone: true, treffpunkt: true, treffpunktTime: true, address: true },
      })
      .catch(() => []);
    const userMap = new Map(userRecords.map((u) => [u.id, u]));

    for (const employee of employees) {
      const uInfo = userMap.get(employee.id);
      const targetEmail = employee.email || uInfo?.email;
      const targetPhone = employee.phone || uInfo?.phone;
      const empName = employee.name || uInfo?.name || 'Mitarbeiter';
      const tpOrt = plan.treffpunkt || uInfo?.treffpunkt || uInfo?.address || 'Kein Treffpunkt angegeben';
      const tpZeit = plan.treffpunktTime || uInfo?.treffpunktTime || 'Keine Treffzeit angegeben';

      await this.prisma.notification
        .create({
          data: {
            userId: employee.id,
            title: headerTitle,
            message: isUpdate
              ? `Ihr Schichtplan am ${formattedDate} in Halle ${plan.hallName} (${plan.warehouseName}) wurde aktualisiert. Schicht: ${plan.shift || 'Standard'}, Treffpunkt: ${tpOrt} (${tpZeit})`
              : `Sie wurden einer Schicht am ${formattedDate} in Halle ${plan.hallName} (${plan.warehouseName}) zugewiesen. Schicht: ${plan.shift || 'Standard'}, Treffpunkt: ${tpOrt} (${tpZeit})`,
            type: isUpdate ? 'PLAN_UPDATED' : 'PLAN_CREATED',
          },
        })
        .catch((err) => {
          this.logger.error(`Notification DB error for user ${employee.id}: ${err.message}`);
        });

      if (targetEmail) {
        const shiftTime = plan.shift || ((plan as any).startTime && (plan as any).endTime ? `${new Date((plan as any).startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} - ${new Date((plan as any).endTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Standardschicht');
        const warehousesList = ((plan as any).locations && (plan as any).locations.length > 0)
          ? (plan as any).locations.map((loc: any) => `${loc.warehouseName || 'Lager'} (${loc.hallName || 'Halle'})`)
          : [`${plan.warehouseName || 'Lager'} (${plan.hallName || 'Halle'})`];

        const planDetails = {
          employeeName: empName,
          date: formattedDate,
          time: shiftTime,
          warehouses: warehousesList,
          notes: plan.notes || 'Keine besonderen Hinweise hinterlegt.',
          title: headerTitle,
          isUpdate: isUpdate,
          treffpunkt: tpOrt,
          treffpunktTime: tpZeit,
          containers: ((plan as any).assignedContainers || []).map((ac: any) => ac.containerNumber || ac.id || String(ac)),
        };

        this.emailService
          .sendPlanNotification(targetEmail, planDetails)
          .then((sent: any) => {
            const isSuccess = sent === true;
            this.logger.log(
              isSuccess ? `✓ Plan notification email sent to ${empName} (${targetEmail})` : `✗ Plan notification email failed for ${targetEmail}: ${sent}`,
            );
            this.prisma.actionLog
              .create({
                data: {
                  userId: actorId || null,
                  action: isSuccess ? 'EMAIL_NOTIFICATION' : 'EMAIL_NOTIFICATION_FAILED',
                  details: isSuccess
                    ? `Plan notification email sent to ${empName} (${targetEmail})`
                    : `Failed to send plan notification email to ${empName} (${targetEmail}): ${sent}`,
                },
              })
              .catch(() => {});
          })
          .catch((err: any) => {
            this.logger.error(`Email error for ${targetEmail}: ${err.message}`);
          });
      }

      if (targetPhone) {
        const waMessage = `Hallo ${empName},\n${isUpdate ? 'Ihr Schichtplan wurde aktualisiert:' : 'Sie wurden für eine neue Schicht eingeteilt:'}\n\n📅 Datum: ${formattedDate}\n🏢 Lager: ${plan.warehouseName}\n📍 Halle: ${plan.hallName}\n🕒 Schicht: ${plan.shift || 'Standard'}\n📍 Treffpunkt: ${tpOrt}\n⏰ Treffpunkt-Uhrzeit: ${tpZeit}${plan.notes ? `\n📝 Notizen: ${plan.notes}` : ''}\n\nBitte loggen Sie sich in das Portal ein für weitere Details.`;

        this.messagingService
          .sendWhatsAppDirect(targetPhone, waMessage)
          .then((res) => {
            this.prisma.actionLog
              .create({
                data: {
                  userId: actorId || null,
                  action: res.success ? 'WHATSAPP_NOTIFICATION' : 'WHATSAPP_NOTIFICATION_FAILED',
                  details: res.success
                    ? `Plan notification WhatsApp sent to ${empName} (${targetPhone})`
                    : `Failed WhatsApp notification to ${empName} (${targetPhone}): ${res.error || 'Unknown error'}`,
                },
              })
              .catch(() => {});
          })
          .catch((err: any) => {
            this.logger.error(`WhatsApp error for ${targetPhone}: ${err.message}`);
          });
      }
    }
  }

  async update(id: string, updatePlanDto: UpdatePlanDto, actorId?: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { id, deletedAt: null },
      include: {
        assignedEmployees: true,
        locations: true,
      },
    });

    if (!plan) {
      throw new NotFoundException(`Daily plan with ID ${id} not found`);
    }

    const prevEmployeeIds = plan.assignedEmployees.map((ae) => ae.employeeId);
    const targetDate = updatePlanDto.date !== undefined ? this.normalizeDate(updatePlanDto.date) : plan.date;
    const targetShift = updatePlanDto.shift !== undefined ? updatePlanDto.shift : plan.shift;
    const { startTime, endTime } = this.getShiftTimeWindow(
      targetDate,
      targetShift,
      updatePlanDto.startTime || plan.startTime,
      updatePlanDto.endTime || plan.endTime,
    );

    await this.prisma.$transaction(async (tx) => {
      const updateData: any = {};
      if (updatePlanDto.date !== undefined) updateData.date = targetDate;
      updateData.startTime = startTime;
      updateData.endTime = endTime;
      if (updatePlanDto.title !== undefined) updateData.title = updatePlanDto.title;
      if (updatePlanDto.description !== undefined) updateData.description = updatePlanDto.description;
      if (updatePlanDto.shift !== undefined) updateData.shift = updatePlanDto.shift;
      if (updatePlanDto.treffpunkt !== undefined) updateData.treffpunkt = updatePlanDto.treffpunkt;
      if (updatePlanDto.treffpunktTime !== undefined) updateData.treffpunktTime = updatePlanDto.treffpunktTime;
      if (updatePlanDto.notes !== undefined) updateData.notes = updatePlanDto.notes;

      await tx.plan.update({
        where: { id },
        data: updateData,
      });

      // Update locations if specified
      if (updatePlanDto.locations !== undefined || (updatePlanDto.warehouseId && updatePlanDto.hallId)) {
        await tx.planLocation.deleteMany({ where: { planId: id } });
        const locs: { warehouseId: string; hallId: string; notes?: string }[] = [];
        if (updatePlanDto.locations && updatePlanDto.locations.length > 0) {
          locs.push(...updatePlanDto.locations);
        } else if (updatePlanDto.warehouseId && updatePlanDto.hallId) {
          locs.push({ warehouseId: updatePlanDto.warehouseId, hallId: updatePlanDto.hallId });
        }
        if (locs.length > 0) {
          for (const l of locs) {
            const hall = await tx.hall.findFirst({
              where: { id: l.hallId, warehouseId: l.warehouseId, deletedAt: null },
            });
            if (!hall) {
              throw new NotFoundException(`Specified hall (${l.hallId}) not found in warehouse (${l.warehouseId})`);
            }
          }
          await tx.planLocation.createMany({
            data: locs.map((l) => ({
              planId: id,
              warehouseId: l.warehouseId,
              hallId: l.hallId,
              notes: l.notes || null,
            })),
          });
        }
      }

      // Update employee assignments and check overlaps
      const effectiveEmployees = updatePlanDto.assignedEmployeeIds !== undefined ? updatePlanDto.assignedEmployeeIds : prevEmployeeIds;

      await tx.planEmployee.deleteMany({
        where: { planId: id },
      });

      if (effectiveEmployees && effectiveEmployees.length > 0) {
        await this.validateNoEmployeeTimeOverlap(tx, effectiveEmployees, startTime, endTime, id);
        await tx.planEmployee.createMany({
          data: effectiveEmployees.map((empId) => ({
            planId: id,
            employeeId: empId,
            startTime,
            endTime,
          })),
        });
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
          const currentPlanLocs = await tx.planLocation.findMany({ where: { planId: id } });
          const primaryLoc = currentPlanLocs[0];
          if (primaryLoc) {
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
                    warehouseId: primaryLoc.warehouseId,
                    hallId: primaryLoc.hallId,
                    status: 'EMPTY',
                  },
                });
              }

              containerIdsToLink.add(container.id);
            }
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
        details: `Updated daily plan (ID: ${id}) assignments and locations`,
      },
    });

    const updatedPlan = await this.findOne(id);

    const currentEmployeeIds = updatedPlan.assignedEmployees.map((ae: any) => ae.id);
    const removedEmployeeIds = prevEmployeeIds.filter((id) => !currentEmployeeIds.includes(id));

    await this.notifyAssignedEmployees(updatedPlan, updatedPlan.assignedEmployees, true, actorId);

    if (removedEmployeeIds.length > 0) {
      const removedEmployees = await this.prisma.user.findMany({
        where: { id: { in: removedEmployeeIds } },
        select: { id: true, name: true, email: true, phone: true },
      });
      const formattedDate = new Date(updatedPlan.date).toLocaleDateString('de-DE');

      for (const emp of removedEmployees) {
        await this.prisma.notification
          .create({
            data: {
              userId: emp.id,
              title: 'Schichtzuweisung entfernt',
              message: `Sie wurden aus dem Schichtplan am ${formattedDate} in ${updatedPlan.warehouseName} (${updatedPlan.hallName}) ausgetragen.`,
              type: 'PLAN_UPDATED',
            },
          })
          .catch(() => {});

        if (emp.email) {
          const shiftTime = updatedPlan.shift || (updatedPlan.startTime && updatedPlan.endTime ? `${new Date(updatedPlan.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} - ${new Date(updatedPlan.endTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Standardschicht');
          const warehousesList = (updatedPlan.locations && updatedPlan.locations.length > 0)
            ? updatedPlan.locations.map((loc: any) => `${loc.warehouseName || 'Lager'} (${loc.hallName || 'Halle'})`)
            : [`${updatedPlan.warehouseName || 'Lager'} (${updatedPlan.hallName || 'Halle'})`];

          const planDetails = {
            employeeName: emp.name || 'Mitarbeiter',
            date: formattedDate,
            time: shiftTime,
            warehouses: warehousesList,
            notes: 'Sie wurden aus diesem Schichtplan ausgetragen. Ihr Dienstplan wurde aktualisiert.',
            title: 'Schichtzuweisung entfernt',
            isRemoved: true,
          };
          this.emailService.sendPlanRemovalNotification(emp.email, planDetails).catch(() => {});
        }

        if (emp.phone) {
          const waMessage = `Hallo ${emp.name},\nSie wurden aus dem Schichtplan am 📅 ${formattedDate} in 🏢 ${updatedPlan.warehouseName} (${updatedPlan.hallName}) ausgetragen.`;
          this.messagingService.sendWhatsAppDirect(emp.phone, waMessage).catch(() => {});
        }
      }
    }

    return updatedPlan;
  }

  async findOne(id: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { id, deletedAt: null },
      include: this.standardInclude,
    });

    if (!plan) {
      throw new NotFoundException(`Daily plan with ID ${id} not found`);
    }

    return this.formatPlanOutput(plan);
  }

  async findByDateAndWarehouse(dateStr: string, warehouseId?: string) {
    const normalizedDate = this.normalizeDate(dateStr);

    const where: any = {
      date: normalizedDate,
      deletedAt: null,
    };
    if (warehouseId) {
      where.locations = { some: { warehouseId } };
    }

    const plans = await this.prisma.plan.findMany({
      where,
      include: this.standardInclude,
    });

    return plans.map((plan) => this.formatPlanOutput(plan));
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
      where.locations = { some: { warehouseId } };
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
        include: this.standardInclude,
      }),
    ]);

    const formattedPlans = plans.map((plan) => this.formatPlanOutput(plan));

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
      include: {
        assignedEmployees: true,
        assignedContainers: true,
        locations: true,
      },
    });

    let count = 0;
    for (const plan of plans) {
      const nextDay = new Date(plan.date);
      nextDay.setDate(nextDay.getDate() + 1);

      const { startTime, endTime } = this.getShiftTimeWindow(nextDay, plan.shift);
      const employeeIds = plan.assignedEmployees.map((e) => e.employeeId);

      try {
        await this.prisma.$transaction(async (tx) => {
          if (employeeIds.length > 0) {
            await this.validateNoEmployeeTimeOverlap(tx, employeeIds, startTime, endTime);
          }

          const newPlan = await tx.plan.create({
            data: {
              date: nextDay,
              startTime,
              endTime,
              title: plan.title ? `${plan.title} (Kopie)` : null,
              description: plan.description,
              shift: plan.shift,
              notes: plan.notes,
            },
          });

          if (plan.locations && plan.locations.length > 0) {
            await tx.planLocation.createMany({
              data: plan.locations.map((loc) => ({
                planId: newPlan.id,
                warehouseId: loc.warehouseId,
                hallId: loc.hallId,
                notes: loc.notes,
              })),
            });
          }

          if (employeeIds.length > 0) {
            await tx.planEmployee.createMany({
              data: employeeIds.map((empId) => ({
                planId: newPlan.id,
                employeeId: empId,
                startTime,
                endTime,
              })),
            });
          }
          count++;
        });
      } catch (err) {
        this.logger.warn(`Skipping duplication for plan ${plan.id} due to overlap or error: ${err.message}`);
      }
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
      await this.prisma.$transaction(async (tx) => {
        await tx.planLocation.deleteMany({ where: { planId: plan.id } });
        await tx.planLocation.create({
          data: {
            planId: plan.id,
            warehouseId: hall.warehouseId,
            hallId: hall.id,
          },
        });
        count++;
      });
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
    const plans = await this.prisma.plan.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: { assignedEmployees: true },
    });

    let count = 0;
    for (const plan of plans) {
      const { startTime, endTime } = this.getShiftTimeWindow(plan.date, shift);
      const employeeIds = plan.assignedEmployees.map((ae) => ae.employeeId);

      try {
        await this.prisma.$transaction(async (tx) => {
          if (employeeIds.length > 0) {
            await tx.planEmployee.deleteMany({ where: { planId: plan.id } });
            await this.validateNoEmployeeTimeOverlap(tx, employeeIds, startTime, endTime, plan.id);
            await tx.planEmployee.createMany({
              data: employeeIds.map((empId) => ({
                planId: plan.id,
                employeeId: empId,
                startTime,
                endTime,
              })),
            });
          }
          await tx.plan.update({
            where: { id: plan.id },
            data: { shift, startTime, endTime },
          });
          count++;
        });
      } catch (err) {
        this.logger.warn(`Could not change shift for plan ${plan.id} due to conflict: ${err.message}`);
      }
    }

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'BULK_CHANGE_SHIFT_PLAN',
        details: `Bulk updated shift for ${count} plans to ${shift}`,
      },
    });

    return { message: `Shift updated for ${count} daily plans successfully` };
  }

  async bulkAssignEmployees(ids: string[], employeeIds: string[], actorId?: string) {
    const plans = await this.prisma.plan.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });

    for (const plan of plans) {
      await this.prisma.$transaction(async (tx) => {
        await tx.planEmployee.deleteMany({
          where: { planId: plan.id },
        });

        if (employeeIds && employeeIds.length > 0) {
          await this.validateNoEmployeeTimeOverlap(tx, employeeIds, plan.startTime, plan.endTime, plan.id);
          await tx.planEmployee.createMany({
            data: employeeIds.map((empId) => ({
              planId: plan.id,
              employeeId: empId,
              startTime: plan.startTime,
              endTime: plan.endTime,
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
