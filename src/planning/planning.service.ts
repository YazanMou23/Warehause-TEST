import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { EmployeeSegmentDto } from './dto/employee-segment.dto';
import { SetEmployeeAbsenceDto } from './dto/employee-absence.dto';
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
    employeeSegments: {
      orderBy: { order: 'asc' as const },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            phone: true,
            role: true,
          },
        },
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
        startTime: loc.startTime || null,
        endTime: loc.endTime || null,
        isOpenEnd: Boolean(loc.isOpenEnd),
        notes: loc.notes || null,
      })),
      shift: plan.shift,
      treffpunkt: plan.treffpunkt,
      treffpunktTime: plan.treffpunktTime,
      notes: plan.notes,
      assignedEmployees: (plan.assignedEmployees || []).map((ae: any) => ae.employee),
      assignedContainers: (plan.assignedContainers || []).map((ac: any) => ac.container),
      employeeSegments: (plan.employeeSegments || []).map((seg: any) => ({
        id: seg.id,
        employeeId: seg.employeeId,
        employeeName: seg.employee?.name || '',
        date: seg.date,
        planId: seg.planId,
        treffpunkt: seg.treffpunkt,
        treffpunktTime: seg.treffpunktTime || null,
        startTime: seg.startTime,
        endTime: seg.endTime || null,
        notes: seg.notes || null,
        order: seg.order || 0,
      })),
    };
  }

  private validateSegmentOverlaps(segments: { employeeId: string; startTime: string; endTime?: string; treffpunkt?: string }[]) {
    const byEmp: Record<string, typeof segments> = {};
    for (const seg of segments) {
      if (!seg || !seg.employeeId) continue;
      if (!byEmp[seg.employeeId]) byEmp[seg.employeeId] = [];
      byEmp[seg.employeeId].push(seg);
    }

    for (const [empId, empSegs] of Object.entries(byEmp)) {
      if (empSegs.length <= 1) continue;

      const toMinutes = (timeStr?: string) => {
        if (!timeStr) return null;
        const parts = timeStr.split(':');
        if (parts.length < 2) return null;
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        return isNaN(h) || isNaN(m) ? null : h * 60 + m;
      };

      for (let i = 0; i < empSegs.length; i++) {
        const s1 = toMinutes(empSegs[i].startTime);
        const e1 = toMinutes(empSegs[i].endTime);
        if (s1 === null || e1 === null) continue;

        for (let j = i + 1; j < empSegs.length; j++) {
          const s2 = toMinutes(empSegs[j].startTime);
          const e2 = toMinutes(empSegs[j].endTime);
          if (s2 === null || e2 === null) continue;

          // Overlap check on working hours interval [s1, e1) and [s2, e2)
          if (s1 < e2 && e1 > s2) {
            throw new ConflictException(
              `Überlappende Arbeitszeiten für Mitarbeiter (${empSegs[i].startTime}-${empSegs[i].endTime} und ${empSegs[j].startTime}-${empSegs[j].endTime}). Arbeitszeiten desselben Mitarbeiters dürfen sich nicht überschneiden.`
            );
          }
        }
      }
    }
  }

  private isPlanDataChanged(oldPlan: any, newPlan: any): boolean {
    if (!oldPlan || !newPlan) return true;
    if (oldPlan.title !== newPlan.title) return true;
    if (oldPlan.description !== newPlan.description) return true;
    if (new Date(oldPlan.date).getTime() !== new Date(newPlan.date).getTime()) return true;
    if (oldPlan.shift !== newPlan.shift) return true;
    if (oldPlan.treffpunkt !== newPlan.treffpunkt) return true;
    if (oldPlan.treffpunktTime !== newPlan.treffpunktTime) return true;
    if (oldPlan.notes !== newPlan.notes) return true;

    const getLocsKey = (p: any) =>
      (p.locations || [])
        .map((l: any) => `${l.warehouseId}_${l.hallId}_${l.startTime}_${l.endTime}_${l.isOpenEnd}`)
        .sort()
        .join(',');
    if (getLocsKey(oldPlan) !== getLocsKey(newPlan)) return true;

    const getEmpsKey = (p: any) =>
      (p.assignedEmployees || [])
        .map((e: any) => e.id || e.employeeId)
        .sort()
        .join(',');
    if (getEmpsKey(oldPlan) !== getEmpsKey(newPlan)) return true;

    const getContsKey = (p: any) =>
      (p.assignedContainers || [])
        .map((c: any) => c.id || c.containerId || c.containerNumber)
        .sort()
        .join(',');
    if (getContsKey(oldPlan) !== getContsKey(newPlan)) return true;

    return false;
  }

  private async notifyRemovedEmployees(updatedPlan: any, removedEmployeeIds: string[]) {
    if (!removedEmployeeIds || removedEmployeeIds.length === 0) return;
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

  private async notifyDeletedPlan(plan: any) {
    if (!plan || !plan.assignedEmployees || plan.assignedEmployees.length === 0) return;
    const formattedDate = new Date(plan.date).toLocaleDateString('de-DE');

    for (const emp of plan.assignedEmployees) {
      if (!emp || !emp.id) continue;

      await this.prisma.notification
        .create({
          data: {
            userId: emp.id,
            title: 'Schichtplan abgesagt',
            message: `Der Schichtplan am ${formattedDate} in ${plan.warehouseName || 'Lager'} (${plan.hallName || 'Halle'}) wurde abgesagt / storniert.`,
            type: 'PLAN_DELETED',
          },
        })
        .catch(() => {});

      if (emp.email) {
        const shiftTime = plan.shift || (plan.startTime && plan.endTime ? `${new Date(plan.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} - ${new Date(plan.endTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Standardschicht');
        const warehousesList = (plan.locations && plan.locations.length > 0)
          ? plan.locations.map((loc: any) => `${loc.warehouseName || 'Lager'} (${loc.hallName || 'Halle'})`)
          : [`${plan.warehouseName || 'Lager'} (${plan.hallName || 'Halle'})`];

        const planDetails = {
          employeeName: emp.name || 'Mitarbeiter',
          date: formattedDate,
          time: shiftTime,
          warehouses: warehousesList,
          notes: 'Dieser Schichtplan wurde von der Betriebsleitung komplett storniert bzw. abgesagt.',
          title: 'Schichtplan abgesagt',
        };
        this.emailService.sendPlanDeletionNotification(emp.email, planDetails).catch(() => {});
      }

      if (emp.phone) {
        const waMessage = `Hallo ${emp.name},\nDer Schichtplan am 📅 ${formattedDate} in 🏢 ${plan.warehouseName || 'Lager'} (${plan.hallName || 'Halle'}) wurde abgesagt / storniert.`;
        this.messagingService.sendWhatsAppDirect(emp.phone, waMessage).catch(() => {});
      }
    }
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
    const targetLocations: { warehouseId: string; hallId: string; startTime?: string; endTime?: string; isOpenEnd?: boolean; notes?: string }[] = [];
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

      // 2. Assign locations with individual hall times
      await tx.planLocation.createMany({
        data: targetLocations.map((loc) => ({
          planId: newPlan.id,
          warehouseId: loc.warehouseId,
          hallId: loc.hallId,
          startTime: loc.startTime || null,
          endTime: loc.endTime || null,
          isOpenEnd: Boolean(loc.isOpenEnd),
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

      // 5. Assign employee-specific segments if provided
      if (createPlanDto.employeeSegments && createPlanDto.employeeSegments.length > 0) {
        this.validateSegmentOverlaps(createPlanDto.employeeSegments);
        for (let idx = 0; idx < createPlanDto.employeeSegments.length; idx++) {
          const seg = createPlanDto.employeeSegments[idx];
          await tx.employeePlanSegment.create({
            data: {
              employeeId: seg.employeeId,
              date: normalizedDate,
              planId: newPlan.id,
              treffpunkt: seg.treffpunkt,
              treffpunktTime: seg.treffpunktTime || null,
              startTime: seg.startTime,
              endTime: seg.endTime || null,
              notes: seg.notes || null,
              order: seg.order !== undefined ? seg.order : idx,
            },
          });
        }
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

  private getCalendarWeek(d: Date): number {
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  }

  async resendPlanNotification(planId: string, actorId?: string) {
    const plan = await this.findOne(planId);
    if (!plan) {
      throw new NotFoundException(`Plan with ID ${planId} not found`);
    }
    await this.notifyAssignedEmployees(plan, plan.assignedEmployees, true, actorId);
    return { success: true, message: `Benachrichtigungen für Plan ${planId} erfolgreich erneut gesendet.` };
  }

  private async notifyAssignedEmployees(
    plan: any,
    employees: Array<{ id: string; name: string; email?: string | null; phone?: string | null }>,
    isUpdate = false,
    actorId?: string,
  ) {
    if (!employees || employees.length === 0) return;

    // Deduplicate employees by ID to prevent duplicate notifications
    const uniqueEmployees: Array<{ id: string; name: string; email?: string | null; phone?: string | null }> = [];
    const seenIds = new Set<string>();
    for (const emp of employees) {
      if (emp && emp.id && !seenIds.has(emp.id)) {
        seenIds.add(emp.id);
        uniqueEmployees.push(emp);
      }
    }
    if (uniqueEmployees.length === 0) return;

    const planDate = new Date(plan.date);
    const formattedDate = planDate.toLocaleDateString('de-DE');
    const kw = this.getCalendarWeek(planDate);
    const headerTitle = isUpdate ? 'Schichtplan aktualisiert' : 'Neue Schichtzuweisung';

    const userRecords: any[] = await this.prisma.user
      .findMany({
        where: { id: { in: uniqueEmployees.map((e) => e.id) } },
        select: { id: true, name: true, email: true, phone: true, treffpunkt: true, treffpunktTime: true, address: true },
      })
      .catch(() => []);
    const userMap = new Map<string, any>(userRecords.map((u: any) => [u.id, u] as const));

    // Fetch employee segments for this plan or date
    const normalizedDate = this.normalizeDate(planDate.toISOString());
    const segments: any[] = await this.prisma.employeePlanSegment
      .findMany({
        where: {
          OR: [
            { planId: plan.id },
            { date: normalizedDate, employeeId: { in: uniqueEmployees.map((e) => e.id) } },
          ],
        },
        orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
      })
      .catch(() => []);

    const segmentsByEmp: Record<string, any[]> = {};
    segments.forEach((seg: any) => {
      if (!segmentsByEmp[seg.employeeId]) segmentsByEmp[seg.employeeId] = [];
      segmentsByEmp[seg.employeeId].push(seg);
    });

    // Fetch employee absences on that date
    const absences: any[] = await this.prisma.employeeAbsence
      .findMany({
        where: {
          date: normalizedDate,
          employeeId: { in: uniqueEmployees.map((e) => e.id) },
        },
      })
      .catch(() => []);
    const absenceMap = new Map(absences.map((a: any) => [a.employeeId, a]));

    // Determine master shift time
    const shiftTime = plan.shift || (plan.startTime && plan.endTime
      ? `${new Date(plan.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} - ${new Date(plan.endTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
      : '08:00 - 14:00 (Standardschicht)');

    // Format locations with hall-specific schedules
    const locationsList = (plan.locations && plan.locations.length > 0)
      ? plan.locations.map((loc: any) => ({
          warehouseName: loc.warehouseName || loc.warehouse?.name || plan.warehouseName || 'Lager',
          hallName: loc.hallName || loc.hall?.name || plan.hallName || 'Halle',
          startTime: loc.startTime || null,
          endTime: loc.endTime || null,
          isOpenEnd: Boolean(loc.isOpenEnd),
          notes: loc.notes || null,
        }))
      : [{
          warehouseName: plan.warehouseName || 'Lager',
          hallName: plan.hallName || 'Halle',
          startTime: null,
          endTime: null,
          isOpenEnd: false,
          notes: null,
        }];

    for (const employee of uniqueEmployees) {
      const uInfo = userMap.get(employee.id);
      const targetEmail = employee.email || uInfo?.email;
      const targetPhone = employee.phone || uInfo?.phone;
      const empName = employee.name || uInfo?.name || 'Mitarbeiter';
      const tpOrt = plan.treffpunkt || uInfo?.treffpunkt || uInfo?.address || 'Kein Treffpunkt angegeben';
      const tpZeit = plan.treffpunktTime || uInfo?.treffpunktTime || 'Keine Treffzeit angegeben';

      const empSegments = segmentsByEmp[employee.id] || [];
      const empAbsence = absenceMap.get(employee.id);

      await this.prisma.notification
        .create({
          data: {
            userId: employee.id,
            title: headerTitle,
            message: isUpdate
              ? `Ihr Schichtplan am ${formattedDate} (KW ${kw}) in Halle ${plan.hallName || 'Lager'} wurde aktualisiert. Schicht: ${shiftTime}.`
              : `Sie wurden einer Schicht am ${formattedDate} (KW ${kw}) in Halle ${plan.hallName || 'Lager'} zugewiesen. Schicht: ${shiftTime}.`,
            type: isUpdate ? 'PLAN_UPDATED' : 'PLAN_CREATED',
          },
        })
        .catch((err) => {
          this.logger.error(`Notification DB error for user ${employee.id}: ${err.message}`);
        });

      if (targetEmail) {
        const planDetails = {
          employeeName: empName,
          date: formattedDate,
          calendarWeek: kw,
          masterShift: shiftTime,
          locations: locationsList,
          segments: empSegments.map((s) => ({
            order: s.order,
            treffpunkt: s.treffpunkt,
            treffpunktTime: s.treffpunktTime || null,
            startTime: s.startTime,
            endTime: s.endTime || null,
            notes: s.notes || null,
          })),
          absence: empAbsence ? {
            status: empAbsence.status,
            reason: empAbsence.reason,
            notes: empAbsence.notes,
          } : null,
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
                    ? `Plan notification email sent to ${empName} (${targetEmail}) [KW ${kw}]`
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
        const whName = plan.warehouseName || locationsList[0]?.warehouseName || 'Duisburg';
        const hName = plan.hallName || locationsList[0]?.hallName || 'Halle';
        const empTp = empSegments.length > 0 && empSegments[0].treffpunkt
          ? `${empSegments[0].treffpunkt}${empSegments[0].treffpunktTime ? ` um ${empSegments[0].treffpunktTime} Uhr` : ''}`
          : `${tpOrt}${tpZeit && tpZeit !== 'Keine Treffzeit angegeben' ? ` um ${tpZeit} Uhr` : ''}`;

        this.messagingService
          .sendShiftPlanNotification({
            phone: targetPhone,
            empName,
            warehouseName: whName,
            hallName: hName,
            treffpunktInfo: empTp,
            dateFormatted: formattedDate,
            shiftTime,
            planId: plan.id,
            employeeId: employee.id,
            headerTitle,
          })
          .then((res) => {
            this.prisma.actionLog
              .create({
                data: {
                  userId: actorId || null,
                  action: res.success ? 'WHATSAPP_NOTIFICATION' : 'WHATSAPP_NOTIFICATION_FAILED',
                  details: res.success
                    ? `Schicht-WhatsApp (${res.method || 'API'}) an ${empName} (${targetPhone}) gesendet`
                    : `Fehler beim WhatsApp-Versand an ${empName} (${targetPhone}): ${res.error || 'Unbekannt'}`,
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

    const oldFormattedPlan = await this.findOne(id);
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
        const locs: { warehouseId: string; hallId: string; startTime?: string; endTime?: string; isOpenEnd?: boolean; notes?: string }[] = [];
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
              startTime: l.startTime || null,
              endTime: l.endTime || null,
              isOpenEnd: Boolean(l.isOpenEnd),
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

      // Update employee segments if specified
      if (updatePlanDto.employeeSegments !== undefined) {
        await tx.employeePlanSegment.deleteMany({ where: { planId: id } });
        if (updatePlanDto.employeeSegments && updatePlanDto.employeeSegments.length > 0) {
          this.validateSegmentOverlaps(updatePlanDto.employeeSegments);
          for (let idx = 0; idx < updatePlanDto.employeeSegments.length; idx++) {
            const seg = updatePlanDto.employeeSegments[idx];
            await tx.employeePlanSegment.create({
              data: {
                employeeId: seg.employeeId,
                date: targetDate,
                planId: id,
                treffpunkt: seg.treffpunkt,
                treffpunktTime: seg.treffpunktTime || null,
                startTime: seg.startTime,
                endTime: seg.endTime || null,
                notes: seg.notes || null,
                order: seg.order !== undefined ? seg.order : idx,
              },
            });
          }
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

    if (this.isPlanDataChanged(oldFormattedPlan, updatedPlan)) {
      await this.notifyAssignedEmployees(updatedPlan, updatedPlan.assignedEmployees, true, actorId);
    }

    if (removedEmployeeIds.length > 0) {
      await this.notifyRemovedEmployees(updatedPlan, removedEmployeeIds);
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
      include: this.standardInclude,
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

    // Notify assigned employees that the plan has been cancelled/deleted
    const formatted = this.formatPlanOutput(plan);
    this.notifyDeletedPlan(formatted).catch(() => {});

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
      include: this.standardInclude,
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

    // Notify assigned employees for all deleted plans
    for (const p of plans) {
      this.notifyDeletedPlan(this.formatPlanOutput(p)).catch(() => {});
    }

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
      const oldPlan = await this.findOne(plan.id);
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
      const updatedPlan = await this.findOne(plan.id);
      if (this.isPlanDataChanged(oldPlan, updatedPlan)) {
        await this.notifyAssignedEmployees(updatedPlan, updatedPlan.assignedEmployees, true, actorId);
      }
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
      const oldPlan = await this.findOne(plan.id);
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
        const updatedPlan = await this.findOne(plan.id);
        if (this.isPlanDataChanged(oldPlan, updatedPlan)) {
          await this.notifyAssignedEmployees(updatedPlan, updatedPlan.assignedEmployees, true, actorId);
        }
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
      const oldPlan = await this.findOne(plan.id);
      const prevEmployeeIds = (oldPlan.assignedEmployees || []).map((ae: any) => ae.id);

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
      const currentEmployeeIds = (updatedPlan.assignedEmployees || []).map((ae: any) => ae.id);
      const removedEmployeeIds = prevEmployeeIds.filter((id: string) => !currentEmployeeIds.includes(id));

      if (this.isPlanDataChanged(oldPlan, updatedPlan)) {
        await this.notifyAssignedEmployees(updatedPlan, updatedPlan.assignedEmployees, true, actorId);
      }
      if (removedEmployeeIds.length > 0) {
        await this.notifyRemovedEmployees(updatedPlan, removedEmployeeIds);
      }
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

  // ─── Employee Plan Segments ──────────────────────────────────────────────────

  async getEmployeeSegments(dateStr: string, employeeId?: string) {
    const targetDate = this.normalizeDate(dateStr);
    const where: any = { date: targetDate };
    if (employeeId) where.employeeId = employeeId;

    return this.prisma.employeePlanSegment.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true, phone: true, role: true } },
        plan: { select: { id: true, title: true, shift: true } },
      },
      orderBy: [{ employeeId: 'asc' }, { order: 'asc' }, { startTime: 'asc' }],
    });
  }

  async saveEmployeeSegments(dateStr: string, segments: EmployeeSegmentDto[], planId?: string) {
    const targetDate = this.normalizeDate(dateStr);
    if (!segments || segments.length === 0) return [];

    this.validateSegmentOverlaps(segments);

    return this.prisma.$transaction(async (tx) => {
      const empIds = Array.from(new Set(segments.map((s) => s.employeeId)));

      const deleteWhere: any = { date: targetDate, employeeId: { in: empIds } };
      if (planId) deleteWhere.planId = planId;
      await tx.employeePlanSegment.deleteMany({ where: deleteWhere });

      const created = [];
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        const seg = await tx.employeePlanSegment.create({
          data: {
            employeeId: s.employeeId,
            date: targetDate,
            planId: s.planId || planId || null,
            treffpunkt: s.treffpunkt,
            treffpunktTime: s.treffpunktTime || null,
            startTime: s.startTime,
            endTime: s.endTime || null,
            notes: s.notes || null,
            order: s.order !== undefined ? s.order : i,
          },
          include: {
            employee: { select: { id: true, name: true } },
          },
        });
        created.push(seg);
      }
      return created;
    });
  }

  async deleteEmployeeSegment(id: string) {
    const seg = await this.prisma.employeePlanSegment.findUnique({ where: { id } });
    if (!seg) throw new NotFoundException(`Segment mit ID ${id} nicht gefunden`);
    return this.prisma.employeePlanSegment.delete({ where: { id } });
  }

  // ─── Employee Absence / Status ───────────────────────────────────────────────

  async getAbsences(dateStr?: string, startDateStr?: string, endDateStr?: string, employeeId?: string) {
    const where: any = {};
    if (dateStr) {
      where.date = this.normalizeDate(dateStr);
    } else if (startDateStr && endDateStr) {
      where.date = {
        gte: this.normalizeDate(startDateStr),
        lte: this.normalizeDate(endDateStr),
      };
    }
    if (employeeId && employeeId !== 'ALL') {
      where.employeeId = employeeId;
    }

    return this.prisma.employeeAbsence.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true, phone: true, role: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'asc' }, { employee: { name: 'asc' } }],
    });
  }

  async setAbsence(dto: SetEmployeeAbsenceDto, actorId?: string) {
    const targetDate = this.normalizeDate(dto.date);

    const emp = await this.prisma.user.findFirst({
      where: { id: dto.employeeId, deletedAt: null },
    });
    if (!emp) {
      throw new NotFoundException(`Mitarbeiter mit ID ${dto.employeeId} nicht gefunden`);
    }

    const absence = await this.prisma.employeeAbsence.upsert({
      where: {
        employeeId_date: {
          employeeId: dto.employeeId,
          date: targetDate,
        },
      },
      create: {
        employeeId: dto.employeeId,
        date: targetDate,
        status: dto.status,
        reason: dto.reason || null,
        notes: dto.notes || null,
        createdById: actorId || null,
      },
      update: {
        status: dto.status,
        reason: dto.reason || null,
        notes: dto.notes || null,
        createdById: actorId || null,
      },
      include: {
        employee: { select: { id: true, name: true } },
      },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'SET_ABSENCE',
        details: `Abwesenheitsstatus für "${emp.name}" am ${targetDate.toISOString().split('T')[0]} auf "${dto.status}" gesetzt (${dto.reason || 'Kein Grund'})`,
      },
    }).catch(() => {});

    return absence;
  }

  async deleteAbsence(employeeId: string, dateStr: string, actorId?: string) {
    const targetDate = this.normalizeDate(dateStr);

    const existing = await this.prisma.employeeAbsence.findUnique({
      where: {
        employeeId_date: {
          employeeId,
          date: targetDate,
        },
      },
      include: { employee: { select: { name: true } } },
    });

    if (!existing) {
      throw new NotFoundException('Keine Abwesenheit für diesen Mitarbeiter an diesem Datum gefunden');
    }

    await this.prisma.employeeAbsence.delete({
      where: { id: existing.id },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'DELETE_ABSENCE',
        details: `Abwesenheit für "${existing.employee?.name || employeeId}" am ${dateStr} entfernt`,
      },
    }).catch(() => {});

    return { message: 'Abwesenheit erfolgreich entfernt' };
  }

  /**
   * Fetch all assigned employees for a date or date-range with confirmation status and feedback reasons
   */
  async getConfirmations(query: {
    date?: string;
    startDate?: string;
    endDate?: string;
    warehouseId?: string;
    hallId?: string;
    status?: string;
    search?: string;
  }) {
    const wherePlan: any = {
      deletedAt: null,
    };

    if (query.date) {
      const normalizedDate = this.normalizeDate(query.date);
      wherePlan.date = normalizedDate;
    } else if (query.startDate && query.endDate) {
      const start = this.normalizeDate(query.startDate);
      const end = this.normalizeDate(query.endDate);
      end.setUTCHours(23, 59, 59, 999);
      wherePlan.date = { gte: start, lte: end };
    }

    const wherePlanEmployee: any = {
      plan: wherePlan,
    };

    if (query.status && query.status !== 'ALL') {
      wherePlanEmployee.confirmationStatus = query.status;
    }

    const assignments = await this.prisma.planEmployee.findMany({
      where: wherePlanEmployee,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            phone: true,
            role: true,
            profilePhoto: true,
            treffpunkt: true,
            treffpunktTime: true,
          },
        },
        plan: {
          include: {
            locations: {
              include: {
                warehouse: { select: { id: true, name: true } },
                hall: { select: { id: true, name: true, color: true } },
              },
            },
            employeeSegments: true,
          },
        },
      },
      orderBy: [{ plan: { date: 'asc' } }, { startTime: 'asc' }],
    });

    // Check employee absences for matching dates
    const dates = Array.from(new Set(assignments.map((a) => a.plan.date.toISOString().split('T')[0])));
    const absences = dates.length > 0
      ? await this.prisma.employeeAbsence.findMany({
          where: {
            date: { in: dates.map((d) => new Date(d)) },
          },
        })
      : [];
    const absenceMap = new Map(absences.map((ab) => [`${ab.employeeId}_${ab.date.toISOString().split('T')[0]}`, ab]));

    const formatted = assignments.map((pe) => {
      const loc = pe.plan.locations?.[0];
      const dateKey = pe.plan.date.toISOString().split('T')[0];
      const absenceKey = `${pe.employeeId}_${dateKey}`;
      const absence = absenceMap.get(absenceKey);

      const segment = pe.plan.employeeSegments?.find((s) => s.employeeId === pe.employeeId);
      const treffpunkt = segment?.treffpunkt || pe.plan.treffpunkt || pe.employee.treffpunkt || 'Standard-Treffpunkt';
      const treffpunktTime = segment?.treffpunktTime || pe.plan.treffpunktTime || pe.employee.treffpunktTime || '-';

      let effectiveStatus = pe.confirmationStatus || 'PENDING';
      let effectiveReason = pe.responseNote || null;

      if (absence) {
        if (absence.status === 'KRANK') {
          effectiveStatus = 'SICK';
          effectiveReason = pe.responseNote || absence.reason || 'Krank gemeldet';
        } else if (absence.status === 'NICHT_GEARBEITET' || absence.status === 'ABWESEND_GRUND') {
          if (effectiveStatus === 'PENDING') {
            effectiveStatus = 'SICK';
            effectiveReason = pe.responseNote || absence.reason || 'Abwesend';
          }
        }
      }

      const shiftStartStr = pe.startTime
        ? new Date(pe.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : '08:00';
      const shiftEndStr = pe.endTime
        ? new Date(pe.endTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : '16:00';

      return {
        planId: pe.planId,
        employeeId: pe.employeeId,
        employeeName: pe.employee.name,
        employeePhone: pe.employee.phone,
        employeePhoto: pe.employee.profilePhoto,
        date: pe.plan.date,
        formattedDate: new Date(pe.plan.date).toLocaleDateString('de-DE'),
        shiftTime: `${shiftStartStr} - ${shiftEndStr}`,
        warehouseId: loc?.warehouseId || null,
        warehouseName: loc?.warehouse?.name || 'Duisburg',
        hallId: loc?.hallId || null,
        hallName: loc?.hall?.name || 'Halle',
        hallColor: loc?.hall?.color || '#2563eb',
        treffpunkt,
        treffpunktTime,
        status: effectiveStatus,
        reason: effectiveReason,
        respondedAt: pe.respondedAt,
        responseChannel: pe.responseChannel,
      };
    });

    let filtered = formatted;
    if (query.warehouseId && query.warehouseId !== 'ALL') {
      filtered = filtered.filter((f) => f.warehouseId === query.warehouseId);
    }
    if (query.hallId && query.hallId !== 'ALL') {
      filtered = filtered.filter((f) => f.hallId === query.hallId);
    }
    if (query.search) {
      const s = query.search.toLowerCase();
      filtered = filtered.filter(
        (f) =>
          f.employeeName.toLowerCase().includes(s) ||
          f.warehouseName.toLowerCase().includes(s) ||
          f.hallName.toLowerCase().includes(s) ||
          (f.reason && f.reason.toLowerCase().includes(s)),
      );
    }

    return {
      total: filtered.length,
      confirmedCount: filtered.filter((f) => f.status === 'CONFIRMED').length,
      sickCount: filtered.filter((f) => f.status === 'SICK').length,
      pendingCount: filtered.filter((f) => f.status === 'PENDING').length,
      customCount: filtered.filter((f) => f.status === 'CUSTOM_RESPONSE').length,
      data: filtered,
    };
  }

  /**
   * Manually update the confirmation status and reason of an employee on a plan
   */
  async updateConfirmation(
    planId: string,
    employeeId: string,
    dto: { status: 'CONFIRMED' | 'SICK' | 'CUSTOM_RESPONSE' | 'PENDING'; reason?: string },
    actorId?: string,
  ) {
    const assignment = await this.prisma.planEmployee.findUnique({
      where: { planId_employeeId: { planId, employeeId } },
      include: { employee: true, plan: true },
    });

    if (!assignment) {
      throw new NotFoundException(`Zuweisung für Plan ${planId} und Mitarbeiter ${employeeId} nicht gefunden`);
    }

    const updated = await this.prisma.planEmployee.update({
      where: { planId_employeeId: { planId, employeeId } },
      data: {
        confirmationStatus: dto.status,
        responseNote: dto.reason !== undefined ? dto.reason : assignment.responseNote,
        respondedAt: new Date(),
        responseChannel: 'MANUAL',
      },
    });

    // If SICK, sync with EmployeeAbsence
    if (dto.status === 'SICK') {
      const normDate = new Date(assignment.plan.date);
      normDate.setUTCHours(0, 0, 0, 0);
      await this.prisma.employeeAbsence.upsert({
        where: {
          employeeId_date: {
            employeeId,
            date: normDate,
          },
        },
        create: {
          employeeId,
          date: normDate,
          status: 'KRANK',
          reason: dto.reason || 'Krankmeldung (manuell erfasst)',
          createdById: actorId || null,
        },
        update: {
          status: 'KRANK',
          reason: dto.reason || 'Krankmeldung (manuell erfasst)',
          createdById: actorId || null,
        },
      });
    }

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'UPDATE_CONFIRMATION_STATUS',
        details: `Schichtstatus für ${assignment.employee.name} auf "${dto.status}" geändert (${dto.reason || 'Kein Grund'})`,
      },
    }).catch(() => {});

    return updated;
  }

  /**
   * Resend WhatsApp notification with the 3 options directly to a specific assigned employee
   */
  async sendSingleConfirmationWhatsApp(planId: string, employeeId: string, actorId?: string) {
    const assignment = await this.prisma.planEmployee.findUnique({
      where: { planId_employeeId: { planId, employeeId } },
      include: {
        employee: true,
        plan: {
          include: {
            locations: {
              include: {
                warehouse: true,
                hall: true,
              },
            },
            employeeSegments: {
              where: { employeeId },
            },
          },
        },
      },
    });

    if (!assignment || !assignment.employee) {
      throw new NotFoundException('Zuweisung nicht gefunden');
    }

    const emp = assignment.employee;
    if (!emp.phone) {
      throw new BadRequestException(`Mitarbeiter ${emp.name} hat keine Telefonnummer hinterlegt.`);
    }

    const loc = assignment.plan.locations?.[0];
    const segment = assignment.plan.employeeSegments?.[0];

    const whName = loc?.warehouse?.name || 'Duisburg';
    const hName = loc?.hall?.name || 'Halle';
    const tpOrt = segment?.treffpunkt || assignment.plan.treffpunkt || emp.treffpunkt || 'Haupttor';
    const tpZeit = segment?.treffpunktTime || assignment.plan.treffpunktTime || emp.treffpunktTime || '07:45';

    const formattedDate = new Date(assignment.plan.date).toLocaleDateString('de-DE');
    const shiftTime = assignment.plan.shift || (assignment.startTime && assignment.endTime
      ? `${new Date(assignment.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} - ${new Date(assignment.endTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
      : '08:00 - 16:00');

    const empTp = `${tpOrt}${tpZeit && tpZeit !== 'Keine Treffzeit angegeben' ? ` um ${tpZeit} Uhr` : ''}`;

    const res = await this.messagingService.sendShiftPlanNotification({
      phone: emp.phone,
      empName: emp.name,
      warehouseName: whName,
      hallName: hName,
      treffpunktInfo: empTp,
      dateFormatted: formattedDate,
      shiftTime,
      planId,
      employeeId,
      headerTitle: 'LogiFlow Schichtplan',
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: res.success ? 'WHATSAPP_CONFIRMATION_REQUEST' : 'WHATSAPP_CONFIRMATION_FAILED',
        details: res.success
          ? `Schicht-WhatsApp (${res.method || 'API'}) an ${emp.name} (${emp.phone}) gesendet`
          : `Fehler beim WhatsApp-Versand an ${emp.name}: ${res.error || 'Unbekannt'}`,
      },
    }).catch(() => {});

    return res;
  }

  /**
   * Send WhatsApp notification with 3 options (Ich bin da / Ich bin krank / Custom Nachricht)
   * to all assigned employees of a plan, returning per-employee results and fallback wa.me links.
   */
  async sendPlanWhatsAppToAll(planId: string, actorId?: string) {
    const plan = await this.findOne(planId);
    if (!plan) {
      throw new NotFoundException(`Plan with ID ${planId} not found`);
    }

    const assignedEmployees = plan.assignedEmployees || [];
    if (assignedEmployees.length === 0) {
      return {
        success: true,
        sentCount: 0,
        failedCount: 0,
        message: 'Keine Mitarbeiter diesem Plan zugewiesen.',
        results: [],
      };
    }

    const planDate = new Date(plan.date);
    const formattedDate = planDate.toLocaleDateString('de-DE');
    const shiftTime = plan.shift || (plan.startTime && plan.endTime
      ? `${new Date(plan.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} - ${new Date(plan.endTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
      : '08:00 - 16:00');

    const loc = plan.locations?.[0];
    const whName = loc?.warehouse?.name || plan.warehouseName || 'Duisburg';
    const hName = loc?.hall?.name || plan.hallName || 'Halle';

    const segments = plan.employeeSegments || [];
    const segmentsByEmp = new Map<string, any[]>();
    for (const seg of segments) {
      if (!segmentsByEmp.has(seg.employeeId)) segmentsByEmp.set(seg.employeeId, []);
      segmentsByEmp.get(seg.employeeId)!.push(seg);
    }

    const results: Array<{
      employeeId: string;
      name: string;
      phone: string;
      success: boolean;
      error?: string;
      waLink?: string;
    }> = [];

    for (const emp of assignedEmployees) {
      if (!emp.phone) {
        results.push({
          employeeId: emp.id,
          name: emp.name,
          phone: '',
          success: false,
          error: 'Keine Telefonnummer hinterlegt',
        });
        continue;
      }

      const empSegments = segmentsByEmp.get(emp.id) || [];
      const tpOrt = (empSegments.length > 0 && empSegments[0].treffpunkt)
        ? empSegments[0].treffpunkt
        : (plan.treffpunkt || emp.treffpunkt || 'Haupttor');
      const tpZeit = (empSegments.length > 0 && empSegments[0].treffpunktTime)
        ? empSegments[0].treffpunktTime
        : (plan.treffpunktTime || emp.treffpunktTime || '07:45');

      const empTp = `${tpOrt}${tpZeit && tpZeit !== 'Keine Treffzeit angegeben' ? ` um ${tpZeit} Uhr` : ''}`;

      const res = await this.messagingService.sendShiftPlanNotification({
        phone: emp.phone,
        empName: emp.name,
        warehouseName: whName,
        hallName: hName,
        treffpunktInfo: empTp,
        dateFormatted: formattedDate,
        shiftTime,
        planId: plan.id,
        employeeId: emp.id,
        headerTitle: 'LogiFlow Schichtplan',
      });

      results.push({
        employeeId: emp.id,
        name: emp.name,
        phone: emp.phone,
        success: res.success,
        error: res.error,
        waLink: res.waLink,
      });

      await this.prisma.actionLog.create({
        data: {
          userId: actorId || null,
          action: res.success ? 'WHATSAPP_NOTIFICATION' : 'WHATSAPP_NOTIFICATION_FAILED',
          details: res.success
            ? `Schicht-WhatsApp (${res.method || 'API'}) an ${emp.name} (${emp.phone}) gesendet`
            : `Fehler beim WhatsApp-Versand an ${emp.name} (${emp.phone}): ${res.error || 'Unbekannt'}`,
        },
      }).catch(() => {});
    }

    const sentCount = results.filter((r) => r.success).length;
    const failedCount = results.length - sentCount;

    return {
      success: failedCount === 0,
      sentCount,
      failedCount,
      results,
    };
  }
}

