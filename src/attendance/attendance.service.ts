import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private getTodayMidnight(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
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

    const attendance = await this.prisma.attendance.create({
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
    const totalHours = Math.round((durationMs / 3600000) * 100) / 100; // Round to 2 decimal places

    const updatedShift = await this.prisma.attendance.update({
      where: { id: activeShift.id },
      data: {
        clockOut: clockOutTime,
        totalHours,
      },
    });

    return updatedShift;
  }

  async getDailyAttendance(dateStr?: string, warehouseId?: string) {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    targetDate.setUTCHours(0, 0, 0, 0);

    const where: any = { date: targetDate };
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    const data = await this.prisma.attendance.findMany({
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

  async getMonthlyReport(employeeId: string, year: number, month: number) {
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

    const records = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        clockIn: {
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

    const totalHours = records.reduce((sum, r) => sum + (r.totalHours || 0), 0);

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
      date: {
        gte: start,
        lte: end,
      },
    };

    if (query.employeeId && query.employeeId !== 'ALL') {
      where.employeeId = query.employeeId;
    }

    const logs = await this.prisma.attendance.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true, phone: true } },
        warehouse: { select: { id: true, name: true } },
        hall: { select: { id: true, name: true } },
      },
      orderBy: { clockIn: 'asc' },
    });

    return {
      start,
      end,
      logs,
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.attendance.update({
        where: { id },
        data: {
          clockIn,
          clockOut,
          breakMinutes: dto.breakMinutes,
          totalHours: dto.totalHours,
          warehouseId: dto.warehouseId || attendance.warehouseId,
          hallId: dto.hallId || attendance.hallId,
          date: new Date(dto.clockIn), // keep date aligned
        },
        include: {
          employee: { select: { id: true, name: true, phone: true } },
          warehouse: { select: { id: true, name: true } },
          hall: { select: { id: true, name: true } },
        },
      });

      // Keep TimesheetEntry in sync if it belongs to a timesheet
      if (attendance.timesheetId) {
        // We find the entry by timesheetId and the date of the attendance record
        const entryDate = new Date(attendance.date);
        const tsEntry = await tx.timesheetEntry.findFirst({
          where: {
            timesheetId: attendance.timesheetId,
            date: entryDate,
          },
        });

        if (tsEntry) {
          const pad = (num: number) => num.toString().padStart(2, '0');
          const startTimeStr = `${pad(clockIn.getUTCHours())}:${pad(clockIn.getUTCMinutes())}`;
          const endTimeStr = clockOut
            ? `${pad(clockOut.getUTCHours())}:${pad(clockOut.getUTCMinutes())}`
            : '00:00';

          let locationName = tsEntry.location;
          if (dto.warehouseId) {
            const wh = await tx.warehouse.findUnique({ where: { id: dto.warehouseId } });
            if (wh) locationName = wh.name;
          }

          await tx.timesheetEntry.update({
            where: { id: tsEntry.id },
            data: {
              startTime: startTimeStr,
              endTime: endTimeStr,
              breakMinutes: dto.breakMinutes,
              totalHours: dto.totalHours,
              location: locationName,
            },
          });
        }
      }

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

  async createManualEntry(dto: any) {
    const clockIn = new Date(dto.clockIn);
    const clockOut = dto.clockOut ? new Date(dto.clockOut) : null;

    const manualEntry = await this.prisma.attendance.create({
      data: {
        employeeId: dto.employeeId,
        warehouseId: dto.warehouseId,
        hallId: dto.hallId,
        clockIn,
        clockOut,
        breakMinutes: dto.breakMinutes,
        totalHours: dto.totalHours,
        date: new Date(dto.clockIn),
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
}
