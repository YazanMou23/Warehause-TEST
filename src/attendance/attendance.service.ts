import { WorkHoursService } from '../work-hours/work-hours.service';
import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { QrScanDto } from './dto/qr-scan.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly hours: WorkHoursService = new WorkHoursService(prisma),
  ) {}

  private getTodayMidnight(): Date {
    return this.hours.workDate(new Date());
  }

  async clockIn(clockInDto: ClockInDto) {
    // Verify user exists and is active
    const user = await this.prisma.user.findFirst({
      where: { id: clockInDto.employeeId, isActive: true, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`Active employee with ID ${clockInDto.employeeId} not found`);
    }

    // Verify warehouse & hall
    const hall = await this.prisma.hall.findFirst({
      where: { id: clockInDto.hallId, warehouseId: clockInDto.warehouseId, deletedAt: null },
    });
    if (!hall) {
      throw new NotFoundException('Specified hall does not exist in the specified warehouse');
    }

    // Check if user is already clocked in (clockOut is null)
    const activeShift = await this.prisma.attendance.findFirst({
      where: {
        employeeId: clockInDto.employeeId,
        clockOut: null,
      },
    });

    if (activeShift) {
      throw new BadRequestException('Employee is already clocked in');
    }

    const today = this.getTodayMidnight();

    const attendance = await this.hours.create({
      data: {
        employeeId: clockInDto.employeeId,
        warehouseId: clockInDto.warehouseId,
        hallId: clockInDto.hallId,
        clockIn: new Date(),
        date: today,
      },
    });

    return attendance;
  }

  async clockOut(clockOutDto: ClockOutDto) {
    // Find active shift
    const activeShift = await this.prisma.attendance.findFirst({
      where: {
        employeeId: clockOutDto.employeeId,
        clockOut: null,
      },
    });

    if (!activeShift) {
      throw new BadRequestException('Employee is not clocked in');
    }

    const clockOutTime = new Date();
    const durationMs = clockOutTime.getTime() - activeShift.clockIn.getTime();
    const totalHours = this.hours.calculate(activeShift.clockIn,clockOutTime,activeShift.breakMinutes??0); // Round to 2 decimal places

    const updatedShift = await this.hours.update({
      where: { id: activeShift.id },
      data: {
        clockOut: clockOutTime,
        totalHours,
      },
    });

    return updatedShift;
  }

  async qrScan(employeeId: string, dto: QrScanDto) {
    const targetEmpId = dto.employeeId || employeeId;

    // Verify employee
    const user = await this.prisma.user.findFirst({
      where: { id: targetEmpId, isActive: true, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException(`Active employee with ID ${targetEmpId} not found`);
    }

    // Verify hall and warehouse
    const hall = await this.prisma.hall.findFirst({
      where: { id: dto.hallId, warehouseId: dto.warehouseId, deletedAt: null },
      include: { warehouse: true },
    });
    if (!hall) {
      throw new NotFoundException('Specified hall does not exist in the warehouse');
    }

    // Check if user has an active shift (clockOut === null)
    const activeShift = await this.prisma.attendance.findFirst({
      where: {
        employeeId: targetEmpId,
        clockOut: null,
      },
      include: {
        hall: { select: { id: true, name: true, color: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });

    if (activeShift) {
      // Clock Out
      const clockOutTime = new Date();
      const durationMs = clockOutTime.getTime() - activeShift.clockIn.getTime();
      const totalHours = this.hours.calculate(activeShift.clockIn,clockOutTime,activeShift.breakMinutes??0);

      const updatedShift = await this.hours.update({
        where: { id: activeShift.id },
        data: {
          clockOut: clockOutTime,
          totalHours,
          source: 'QR_SCAN',
        },
        include: {
          hall: { select: { id: true, name: true, color: true } },
          warehouse: { select: { id: true, name: true } },
        },
      });

      return {
        action: 'CLOCK_OUT',
        message: `Ausgestempelt aus ${updatedShift.hall.name} (${updatedShift.warehouse.name})`,
        attendance: updatedShift,
        totalHours,
      };
    } else {
      // Clock In
      const today = this.getTodayMidnight();
      const newShift = await this.hours.create({
        data: {
          employeeId: targetEmpId,
          warehouseId: dto.warehouseId,
          hallId: dto.hallId,
          clockIn: new Date(),
          date: today,
          source: 'QR_SCAN',
        },
        include: {
          hall: { select: { id: true, name: true, color: true } },
          warehouse: { select: { id: true, name: true } },
        },
      });

      return {
        action: 'CLOCK_IN',
        message: `Eingestempelt in ${newShift.hall.name} (${newShift.warehouse.name})`,
        attendance: newShift,
      };
    }
  }

  async getDailyAttendance(dateStr?: string, warehouseId?: string) {
    const targetDate = dateStr ? new Date(dateStr) : this.hours.workDate(new Date());
    targetDate.setUTCHours(0, 0, 0, 0);

    const dayEnd = new Date(targetDate); dayEnd.setUTCDate(dayEnd.getUTCDate()+1);
    const where: any = { date: {gte:targetDate,lt:dayEnd} };
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    const data = await this.hours.list({
      where,
      include: {
        employee: {
          select: { id: true, name: true, phone: true },
        },
        warehouse: { select: { name: true } },
        hall: { select: { name: true, color: true } },
      },
      orderBy: { clockIn: 'desc' },
    });

    return data;
  }

  async isWorkHoursHiddenForEmployee(employeeId: string): Promise<boolean> {
    return this.settingsService.isWorkHoursHiddenForEmployee(employeeId);
  }

  async getMonthlyReport(employeeId: string, year: number, month: number, actorRole?: Role) {
    if (actorRole === Role.EMPLOYEE) {
      const isHidden = await this.isWorkHoursHiddenForEmployee(employeeId);
      if (isHidden) {
        throw new ForbiddenException('Arbeitszeitberichte sind für Mitarbeiter deaktiviert.');
      }
    }

    // Verify user
    const user = await this.prisma.user.findFirst({
      where: { id: employeeId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    // Set first and last day of the month in UTC
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const records = await this.hours.list({
      where: {
        employeeId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        warehouse: { select: { name: true } },
        hall: { select: { name: true } },
      },
      orderBy: { clockIn: 'asc' },
    });

    const totalHours = this.hours.sum(records);

    return {
      employee: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
      month,
      year,
      totalHours: Math.round(totalHours * 100) / 100,
      recordCount: records.length,
      records: records.map((r) => ({
        id: r.id,
        date: r.date.toISOString().split('T')[0],
        clockIn: r.clockIn,
        clockOut: r.clockOut,
        totalHours: r.totalHours,
        warehouseName: r.warehouse.name,
        hallName: r.hall.name,
      })),
    };
  }

  async getAttendanceReport(query: any) {
    const timeframe = query.timeframe;
    const year = parseInt(query.year, 10);
    let start: Date;
    let end: Date;

    if (timeframe === 'daily') {
      if (!query.date) {
        throw new BadRequestException('Query parameter "date" is required for daily timeframe');
      }
      start = new Date(query.date);
      start.setUTCHours(0, 0, 0, 0);
      end = new Date(start);
      end.setUTCHours(23, 59, 59, 999);
    } else if (timeframe === 'weekly') {
      if (!query.week) {
        throw new BadRequestException('Query parameter "week" is required for weekly timeframe');
      }
      const week = parseInt(query.week, 10);
      const range = this.getDateRangeOfWeek(week, year);
      start = range.start;
      end = range.end;
    } else if (timeframe === 'monthly') {
      if (!query.month) {
        throw new BadRequestException('Query parameter "month" is required for monthly timeframe');
      }
      const month = parseInt(query.month, 10);
      start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    } else {
      throw new BadRequestException('Invalid timeframe');
    }

    const where: any = {
      ...(query.employeeId && query.employeeId!=='ALL' ? {employeeId:query.employeeId}:{}),
      date: {
        gte: start,
        lte: end,
      },
    };

    const [logs, absences] = await Promise.all([
      this.hours.list({
        where,
        include: {
          employee: { select: { id: true, name: true, phone: true, hallId: true, warehouseId: true } },
          warehouse: { select: { id: true, name: true } },
          hall: { select: { id: true, name: true, color: true } },
        },
        orderBy: { clockIn: 'asc' },
      }),
      this.prisma.employeeAbsence.findMany({
        where: {
          date: { gte: start, lte: end },
          ...(query.employeeId && query.employeeId !== 'ALL' ? { employeeId: query.employeeId } : {}),
        },
        include: {
          employee: { select: { id: true, name: true, phone: true, hallId: true, warehouseId: true } },
        },
        orderBy: { date: 'asc' },
      }),
    ]);

    return {
      start,
      end,
      logs,
      absences,
    };
  }

  async updateAttendance(id: string, dto: any) {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
    });

    if (!attendance) {
      throw new NotFoundException(`Zeiterfassungs-Eintrag mit ID ${id} nicht gefunden`);
    }

    const clockIn = new Date(dto.clockIn);
    const clockOut = dto.clockOut ? new Date(dto.clockOut) : null;
    const targetDate = dto.date ? new Date(dto.date) : this.hours.workDate(clockIn);

    return this.prisma.$transaction(async (tx) => {
      let whId = dto.warehouseId || attendance.warehouseId;
      let hlId = dto.hallId || attendance.hallId;

      // Ensure hall belongs to warehouse if warehouse changed
      if (dto.warehouseId && !dto.hallId && dto.warehouseId !== attendance.warehouseId) {
        const wh = await tx.warehouse.findUnique({
          where: { id: dto.warehouseId },
          include: { halls: { where: { deletedAt: null }, take: 1 } },
        });
        if (wh && wh.halls && wh.halls.length > 0) {
          hlId = wh.halls[0].id;
        }
      }

      const updated = await this.hours.update({
        where: { id },
        data: {
          clockIn,
          clockOut,
          breakMinutes: dto.breakMinutes,
          totalHours: dto.totalHours ?? this.hours.calculate(clockIn,clockOut,dto.breakMinutes??attendance.breakMinutes??0),
          warehouseId: whId,
          hallId: hlId,
          date: targetDate,
        },
        include: {
          employee: { select: { id: true, name: true, phone: true } },
          warehouse: { select: { id: true, name: true } },
          hall: { select: { id: true, name: true } },
        },
      }, tx);

      // Trigger notification for hours changed
      await tx.notification.create({
        data: {
          userId: updated.employeeId,
          title: 'Arbeitszeit aktualisiert',
          message: `Ihr Zeiterfassungs-Eintrag für den ${updated.date.toLocaleDateString('de-DE')} wurde aktualisiert auf: ${updated.totalHours} Stunden.`,
          type: 'HOURS_CHANGED',
        },
      }).catch(() => {});

      return updated;
    });
  }

  async createManualEntry(dto: any, actorRole?: Role) {
    if (actorRole === Role.EMPLOYEE) {
      const isHidden = await this.isWorkHoursHiddenForEmployee(dto.employeeId);
      if (isHidden) {
        throw new ForbiddenException('Die manuelle Erfassung von Arbeitszeiten und Stundenzetteln ist für Mitarbeiter deaktiviert.');
      }
    }

    const clockIn = new Date(dto.clockIn);
    const clockOut = dto.clockOut ? new Date(dto.clockOut) : null;

    let whId = dto.warehouseId;
    let hlId = dto.hallId;

    if (!whId || !hlId) {
      const emp = await this.prisma.user.findUnique({
        where: { id: dto.employeeId },
        select: { warehouseId: true, hallId: true },
      });
      whId = whId || emp?.warehouseId || null;
      hlId = hlId || emp?.hallId || null;

      if (!whId || !hlId) {
        const fallbackWh = await this.prisma.warehouse.findFirst({
          where: { deletedAt: null },
          include: { halls: { where: { deletedAt: null } } },
        });
        if (fallbackWh) {
          whId = whId || fallbackWh.id;
          if (fallbackWh.halls?.length > 0) {
            hlId = hlId || fallbackWh.halls[0].id;
          }
        }
      }
    }

    if (!whId || !hlId) {
      throw new BadRequestException('Kein Lager oder Halle im System gefunden. Bitte ordnen Sie dem Mitarbeiter ein Lager zu oder erstellen Sie ein Standard-Lager im System.');
    }

    const manualEntry = await this.hours.create({
      data: {
        employeeId: dto.employeeId,
        warehouseId: whId,
        hallId: hlId,
        clockIn,
        clockOut,
        breakMinutes: dto.breakMinutes ?? 0,
        totalHours: dto.totalHours ?? this.hours.calculate(clockIn,clockOut,dto.breakMinutes??0),
        date: dto.date && /^\d{4}-\d{2}-\d{2}$/.test(dto.date) ? new Date(dto.date) : this.hours.workDate(clockIn),
        source: 'MANUAL',
      },
      include: {
        employee: { select: { id: true, name: true, phone: true } },
        warehouse: { select: { id: true, name: true } },
        hall: { select: { id: true, name: true } },
      },
    });

    // Trigger notification
    await this.prisma.notification.create({
      data: {
        userId: manualEntry.employeeId,
        title: 'Manuelle Zeiterfassung',
        message: `Ein neuer Zeiterfassungs-Eintrag wurde manuell für den ${manualEntry.date.toLocaleDateString('de-DE')} erfasst: ${manualEntry.totalHours} Stunden.`,
        type: 'HOURS_CHANGED',
      },
    }).catch(() => {});

    return manualEntry;
  }

  async deleteAttendance(id: string, actorId: string, actorRole?: Role) {
    const record = await this.prisma.attendance.findUnique({
      where: { id },
      include: { employee: { select: { name: true } } },
    });

    if (!record) {
      throw new NotFoundException(`Zeiterfassungseintrag mit ID ${id} nicht gefunden`);
    }

    if (actorRole === Role.EMPLOYEE && record.employeeId !== actorId) {
      throw new ForbiddenException('Sie können nur Ihre eigenen Zeiterfassungen löschen');
    }

    if (actorRole === Role.EMPLOYEE) {
      const isHidden = await this.isWorkHoursHiddenForEmployee(actorId);
      if (isHidden) {
        throw new ForbiddenException('Aktion nicht erlaubt: Zeiterfassungen sind für Mitarbeiter gesperrt.');
      }
    }

    await this.hours.delete({
      where: { id },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId,
        action: 'ATTENDANCE_DELETE',
        details: `Zeiterfassungseintrag "${id}" für Mitarbeiter "${record.employee?.name || record.employeeId}" gelöscht`,
      },
    }).catch(() => {});

    return { message: 'Zeiterfassungseintrag erfolgreich gelöscht' };
  }

  private getDateRangeOfWeek(week: number, year: number) {
    // Find the first Thursday of the year (ISO week standard)
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const day = jan1.getUTCDay();
    const diff = (day <= 4 ? 1 - day : 8 - day);
    const firstMonday = new Date(jan1);
    firstMonday.setUTCDate(jan1.getUTCDate() + diff);

    const start = new Date(firstMonday);
    start.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);

    return { start, end };
  }

  async getDashboardAnalytics(timeframe: 'weekly' | 'monthly' = 'weekly', dateStr?: string) {
    const baseDate = dateStr ? new Date(dateStr) : new Date();
    const year = baseDate.getFullYear();

    let start: Date;
    let end: Date;
    let rangeLabel = '';

    if (timeframe === 'monthly') {
      const month = baseDate.getMonth();
      start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
      rangeLabel = baseDate.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
    } else {
      // Weekly: Monday to Sunday
      const d = new Date(baseDate);
      const day = d.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      start = new Date(d);
      start.setDate(d.getDate() + diffToMonday);
      start.setUTCHours(0, 0, 0, 0);

      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setUTCHours(23, 59, 59, 999);

      const d1 = start.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      const d2 = end.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      rangeLabel = `KW ${this.getIsoWeek(start)} (${d1} - ${d2})`;
    }

    // 1. All active non-admin employees
    const employees = await this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null, role: { not: 'ADMIN' } },
      select: { id: true, name: true, phone: true, role: true },
      orderBy: { name: 'asc' },
    });

    // 2. All attendance records in range
    const logs = await this.hours.list({
      where: {
        date: { gte: start, lte: end },
      },
      include: {
        employee: { select: { id: true, name: true } },
      },
    });

    // 3. All absences in range
    const absences = await this.prisma.employeeAbsence.findMany({
      where: {
        date: { gte: start, lte: end },
      },
      include: {
        employee: { select: { id: true, name: true } },
      },
    });

    const defaultSollPerWeek = 40.0;
    const defaultSollPerMonth = 160.0;
    const standardSoll = timeframe === 'monthly' ? defaultSollPerMonth : defaultSollPerWeek;

    const employeeStats = employees.map((emp) => {
      const empLogs = logs.filter((l) => l.employeeId === emp.id);
      const empAbsences = absences.filter((a) => a.employeeId === emp.id);

      const istHours = Math.round(empLogs.reduce((acc, curr) => acc + (curr.totalHours || 0), 0) * 100) / 100;
      const sollHours = standardSoll;
      const diff = Math.round((istHours - sollHours) * 100) / 100;
      const percentage = sollHours > 0 ? Math.round((istHours / sollHours) * 100) : 0;

      return {
        id: emp.id,
        name: emp.name,
        phone: emp.phone,
        role: emp.role,
        soll: sollHours,
        ist: istHours,
        diff,
        percentage,
        absenceDays: empAbsences.length,
        absenceDetails: empAbsences.map((a) => ({
          date: a.date.toISOString().split('T')[0],
          status: a.status,
          reason: a.reason,
        })),
      };
    });

    const aggregatedTrend: Array<{ label: string; date?: string; totalHours: number; activeCount: number }> = [];

    if (timeframe === 'weekly') {
      const weekdaysDe = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
      for (let i = 0; i < 7; i++) {
        const curDate = new Date(start);
        curDate.setDate(start.getDate() + i);
        const dateStr = curDate.toISOString().split('T')[0];
        const dayLogs = logs.filter((l) => l.date && l.date.toISOString().split('T')[0] === dateStr);
        const dayHours = Math.round(dayLogs.reduce((acc, curr) => acc + (curr.totalHours || 0), 0) * 100) / 100;
        const activeEmpIds = new Set(dayLogs.map((l) => l.employeeId));

        aggregatedTrend.push({
          label: `${weekdaysDe[i]} ${curDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`,
          date: dateStr,
          totalHours: dayHours,
          activeCount: activeEmpIds.size,
        });
      }
    } else {
      const numDays = new Date(year, baseDate.getMonth() + 1, 0).getDate();
      const weeksCount = Math.ceil(numDays / 7);

      for (let w = 0; w < weeksCount; w++) {
        const wStart = new Date(Date.UTC(year, baseDate.getMonth(), w * 7 + 1, 0, 0, 0, 0));
        const wEndDay = Math.min((w + 1) * 7, numDays);
        const wEnd = new Date(Date.UTC(year, baseDate.getMonth(), wEndDay, 23, 59, 59, 999));

        const weekLogs = logs.filter((l) => l.date && l.date >= wStart && l.date <= wEnd);
        const weekHours = Math.round(weekLogs.reduce((acc, curr) => acc + (curr.totalHours || 0), 0) * 100) / 100;
        const activeEmpIds = new Set(weekLogs.map((l) => l.employeeId));

        aggregatedTrend.push({
          label: `Woche ${w + 1} (${w * 7 + 1}.-${wEndDay}. ${baseDate.toLocaleString('de-DE', { month: 'short' })})`,
          totalHours: weekHours,
          activeCount: activeEmpIds.size,
        });
      }
    }

    const totalIst = Math.round(employeeStats.reduce((acc, curr) => acc + curr.ist, 0) * 100) / 100;
    const totalSoll = Math.round(employeeStats.reduce((acc, curr) => acc + curr.soll, 0) * 100) / 100;

    return {
      timeframe,
      range: {
        start: start.toISOString(),
        end: end.toISOString(),
        label: rangeLabel,
      },
      employeeStats,
      aggregatedTrend,
      summary: {
        totalIst,
        totalSoll,
        diff: Math.round((totalIst - totalSoll) * 100) / 100,
        employeesCount: employees.length,
        activeEmployeesCount: new Set(logs.map((l) => l.employeeId)).size,
      },
    };
  }

  private getIsoWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
}


