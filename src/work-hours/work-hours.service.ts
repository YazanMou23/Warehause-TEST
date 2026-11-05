import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Attendance is the only posted hours ledger. TimesheetEntry remains OCR draft/source,
 * not a second mutable posted ledger. No fallback/summing of the two sources. */
@Injectable()
export class WorkHoursService {
  constructor(private readonly prisma: PrismaService) {}
  workDate(instant: Date) {
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
    return new Date(`${day}T00:00:00Z`);
  }
  calculate(clockIn: Date, clockOut: Date | null, breakMinutes = 0) {
    return clockOut
      ? this.round(
          Math.max(
            0,
            (clockOut.getTime() - clockIn.getTime()) / 3600000 -
              breakMinutes / 60,
          ),
        )
      : 0;
  }
  private round(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
  sum(rows: any[]) {
    return this.round(
      rows.reduce((sum, row) => sum + (Number(row.totalHours) || 0), 0),
    );
  }
  async list(args: any, db: any = this.prisma): Promise<any[]> {
    return db.attendance.findMany(args);
  }
  async create(args: any, db: any = this.prisma) {
    return db.attendance.create({ ...args, data: this.normalize(args.data) });
  }
  async update(args: any, db: any = this.prisma) {
    return db.attendance.update({ ...args, data: this.normalize(args.data) });
  }
  async delete(args: any, db: any = this.prisma) {
    return db.attendance.delete(args);
  }
  async deleteMany(args: any, db: any = this.prisma) {
    return db.attendance.deleteMany(args);
  }
  private normalize(data: any) {
    const copy = { ...data };
    if (copy.clockIn && !Number.isFinite(new Date(copy.clockIn).getTime()))
      throw new BadRequestException('Invalid start time');
    if (
      copy.clockIn &&
      copy.clockOut &&
      new Date(copy.clockOut) < new Date(copy.clockIn)
    )
      throw new BadRequestException('End before start');
    if (copy.clockOut && !Number.isFinite(new Date(copy.clockOut).getTime()))
      throw new BadRequestException('Invalid end time');
    if (
      copy.breakMinutes !== undefined &&
      (!Number.isFinite(copy.breakMinutes) || copy.breakMinutes < 0)
    )
      throw new BadRequestException('Invalid break');
    if (copy.date) {
      const date = new Date(copy.date);
      if (!Number.isFinite(date.getTime()))
        throw new BadRequestException('Invalid work date');
      date.setUTCHours(0, 0, 0, 0);
      copy.date = date;
    }

    if (copy.totalHours !== undefined && copy.totalHours !== null) {
      if (!Number.isFinite(copy.totalHours) || copy.totalHours < 0)
        throw new BadRequestException('Invalid registered hours');
      copy.totalHours = this.round(copy.totalHours);
    }
    return copy;
  }
  displayTime(instant: Date, source?: string) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: source === 'SCAN' ? 'UTC' : 'Europe/Berlin',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(instant);
  }
  clockOnWorkDate(date: Date, text: string, source?: string): Date {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text))
      throw new BadRequestException('Invalid clock time');
    const [h, m] = text.split(':').map(Number);
    const naive = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      h,
      m,
    );
    if (source === 'SCAN') return new Date(naive); // legacy OCR wall-clock storage
    // Resolve Berlin wall time; reject nonexistent/ambiguous DST times rather than guess.
    const candidates = [naive - 3600000, naive - 7200000]
      .map((n) => new Date(n))
      .filter(
        (d) =>
          this.displayTime(d, source) === text &&
          this.workDate(d).getTime() ===
            new Date(
              Date.UTC(
                date.getUTCFullYear(),
                date.getUTCMonth(),
                date.getUTCDate(),
              ),
            ).getTime(),
      );
    if (candidates.length !== 1)
      throw new BadRequestException(
        'Ambiguous or invalid Berlin clock time; use attendance editor with explicit offset',
      );
    return candidates[0];
  }
  entryAttendanceId(entryId: string) {
    const h = createHash('sha256')
      .update(`posted-timesheet-entry:${entryId}`)
      .digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  }
  async projectTimesheet(ts: any, db: any = this.prisma) {
    if (ts.status !== 'CONFIRMED') return { ...ts, hoursSource: 'OCR_DRAFT' };
    if (!ts.employeeId)
      throw new ConflictException('Posted timesheet has no employee');
    const start = new Date(ts.weekStartDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    const rows = await this.list(
      {
        where: { employeeId: ts.employeeId, date: { gte: start, lt: end } },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        include: {
          warehouse: { select: { name: true } },
          hall: { select: { name: true } },
        },
      },
      db,
    );
    const entries = rows.map((row) => ({
      id: row.id,
      attendanceId: row.id,
      timesheetId: ts.id,
      date: row.date,
      weekday: new Intl.DateTimeFormat('de-DE', {
        weekday: 'long',
        timeZone: 'UTC',
      }).format(row.date),
      startTime: row.clockIn ? this.displayTime(row.clockIn, row.source) : '',
      endTime: row.clockOut ? this.displayTime(row.clockOut, row.source) : null,
      breakMinutes: row.breakMinutes,
      totalHours: row.totalHours ?? 0,
      isActive: true,
      location: row.warehouse?.name ?? null,
    }));
    return {
      ...ts,
      entries,
      totalHours: this.sum(rows),
      entryCount: rows.length,
      hoursSource: 'ATTENDANCE',
    };
  }
  async hoursForPeriod(employeeId: string, start: Date, end: Date) {
    if (!employeeId) throw new BadRequestException('employeeId required');
    const rows = await this.list({
      where: { employeeId, date: { gte: start, lte: end } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    const entries = rows
      .filter(
        (r) =>
          r.employeeId === employeeId &&
          r.date >= start &&
          r.date <= end &&
          typeof r.totalHours === 'number' &&
          Number.isFinite(r.totalHours),
      )
      .map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        weekday: '',
        startTime: r.clockIn ? this.displayTime(r.clockIn, r.source) : '',
        endTime: r.clockOut ? this.displayTime(r.clockOut, r.source) : '',
        breakMinutes: r.breakMinutes ?? 0,
        hours: r.totalHours,
        location: null,
      }));
    return {
      hasRecords: entries.length > 0,
      totalHours: entries.length
        ? this.round(entries.reduce((s, e) => s + e.hours, 0))
        : null,
      daysCount: new Set(entries.map((e) => e.date)).size,
      entries,
    };
  }
}
