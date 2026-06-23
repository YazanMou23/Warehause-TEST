import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TimesheetOcrService } from './timesheet-ocr.service';
import { TimesheetMatcherService } from './timesheet-matcher.service';
import { ConfirmTimesheetDto } from './dto/confirm-timesheet.dto';
import { TimesheetQueryDto } from './dto/timesheet-query.dto';
import { TimesheetStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TimesheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ocrService: TimesheetOcrService,
    private readonly matcherService: TimesheetMatcherService,
  ) {}

  // ─── SCAN & CREATE ─────────────────────────────────────────────────────────

  async scanAndCreate(file: Express.Multer.File, creatorId: string) {
    // 1. OCR extraction
    const ocrResult = await this.ocrService.extractFromFile(file);

    // 2. Fuzzy employee matching
    const matchResult = await this.matcherService.findBestMatch(ocrResult.employeeName);

    // 3. Derive week start (Monday) from first entry date if available
    const weekStartDate = this.deriveWeekStart(ocrResult);

    // 4. Store timesheet in PENDING_REVIEW state
    const timesheet = await this.prisma.timesheet.create({
      data: {
        employeeName: ocrResult.employeeName,
        employeeId: matchResult.found ? matchResult.employeeId ?? null : null,
        weekStartDate,
        status: TimesheetStatus.PENDING_REVIEW,
        createdById: creatorId,
        ocrConfidence: matchResult.confidence,
        ocrRawResponse: ocrResult as any,
        entries: {
          create: ocrResult.entries.map((e) => ({
            weekday: e.weekday,
            date: new Date(e.date),
            startTime: e.startTime,
            endTime: e.endTime,
            breakMinutes: e.breakMinutes,
            totalHours: e.totalHours,
            location: e.location ?? null,
          })),
        },
      },
      include: {
        entries: { orderBy: { date: 'asc' } },
        employee: { select: { id: true, name: true } },
      },
    });

    // 5. Log action
    await this.prisma.actionLog.create({
      data: {
        userId: creatorId,
        action: 'TIMESHEET_SCAN',
        details: `Stundenzettel gescannt für "${ocrResult.employeeName}" (KW ${this.getKw(weekStartDate)}). Match: ${matchResult.confidence}`,
      },
    });

    return {
      ...timesheet,
      employeeMatch: {
        found: matchResult.found,
        confidence: matchResult.confidence,
        matchedName: matchResult.matchedName,
        isNewEmployee: !matchResult.found,
      },
      ocrWarning: ocrResult.warning,
      sandbox: ocrResult.sandbox ?? false,
    };
  }

  // ─── CONFIRM & SAVE ────────────────────────────────────────────────────────

  async confirmTimesheet(id: string, dto: ConfirmTimesheetDto, actorId: string) {
    const timesheet = await this.prisma.timesheet.findUnique({
      where: { id },
      include: { entries: true },
    });

    if (!timesheet) {
      throw new NotFoundException(`Stundenzettel mit ID ${id} nicht gefunden`);
    }

    if (timesheet.status === TimesheetStatus.CONFIRMED) {
      throw new BadRequestException('Dieser Stundenzettel wurde bereits bestätigt');
    }

    // ── Validate entries ────────────────────────────────────────────────────
    const validEntries = dto.entries.filter(
      (e) => e.startTime?.trim() && e.endTime?.trim(),
    );

    if (validEntries.length === 0) {
      throw new BadRequestException('Mindestens eine gültige Zeiterfassung ist erforderlich');
    }

    for (const entry of validEntries) {
      this.validateEntry(entry);
    }

    // ── Resolve employee ─────────────────────────────────────────────────────
    let employeeId: string;

    if (dto.employeeId) {
      // Verify employee exists
      const emp = await this.prisma.user.findFirst({
        where: { id: dto.employeeId, isActive: true, deletedAt: null },
      });
      if (!emp) {
        throw new NotFoundException(`Mitarbeiter mit ID ${dto.employeeId} nicht gefunden`);
      }
      employeeId = emp.id;
    } else if (dto.createNewEmployee) {
      // Create a new employee
      const newEmp = dto.createNewEmployee;

      // Check for duplicates
      const existing = await this.prisma.user.findFirst({
        where: {
          OR: [{ username: newEmp.username }, { phone: newEmp.phone }],
        },
      });
      if (existing) {
        throw new ConflictException(
          'Ein Mitarbeiter mit diesem Benutzernamen oder dieser Telefonnummer existiert bereits',
        );
      }

      const passwordHash = await bcrypt.hash(newEmp.password, 10);
      const createdUser = await this.prisma.user.create({
        data: {
          username: newEmp.username,
          name: newEmp.name,
          phone: newEmp.phone,
          passwordHash,
          role: Role.EMPLOYEE,
        },
      });

      await this.prisma.actionLog.create({
        data: {
          userId: actorId,
          action: 'CREATE_USER',
          details: `Neuer Mitarbeiter "${createdUser.name}" (${createdUser.username}) via Stundenzettel-Scan angelegt`,
        },
      });

      employeeId = createdUser.id;
    } else {
      throw new BadRequestException(
        'Bitte wähle einen Mitarbeiter aus oder lege einen neuen an',
      );
    }

    // ── Check duplicate confirmed timesheet for same employee + week ─────────
    const weekStart = timesheet.weekStartDate;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const duplicate = await this.prisma.timesheet.findFirst({
      where: {
        id: { not: id },
        employeeId,
        status: TimesheetStatus.CONFIRMED,
        weekStartDate: { gte: weekStart, lt: weekEnd },
      },
    });

    if (duplicate) {
      throw new ConflictException(
        'Für diesen Mitarbeiter existiert bereits ein bestätigter Stundenzettel für diese Woche',
      );
    }

    // ── Persist in transaction ───────────────────────────────────────────────
    const updated = await this.prisma.$transaction(async (tx) => {
      // Delete old entries and recreate with corrected data
      await tx.timesheetEntry.deleteMany({ where: { timesheetId: id } });

      const confirmed = await tx.timesheet.update({
        where: { id },
        data: {
          employeeId,
          employeeName: timesheet.employeeName,
          status: TimesheetStatus.CONFIRMED,
          entries: {
            create: validEntries.map((e) => ({
              weekday: e.weekday,
              date: new Date(e.date),
              startTime: e.startTime.trim(),
              endTime: e.endTime.trim(),
              breakMinutes: e.breakMinutes,
              totalHours: e.totalHours,
              location: e.location?.trim() ?? null,
            })),
          },
        },
        include: {
          entries: { orderBy: { date: 'asc' } },
          employee: { select: { id: true, name: true } },
        },
      });

      return confirmed;
    });

    // ── Audit log ────────────────────────────────────────────────────────────
    await this.prisma.actionLog.create({
      data: {
        userId: actorId,
        action: 'TIMESHEET_CONFIRM',
        details: `Stundenzettel "${id}" bestätigt für Mitarbeiter "${updated.employee?.name ?? updated.employeeName}" (${validEntries.length} Tage, ${validEntries.reduce((s, e) => s + e.totalHours, 0).toFixed(2)} h)`,
      },
    });

    return updated;
  }

  // ─── LIST ──────────────────────────────────────────────────────────────────

  async findAll(query: TimesheetQueryDto) {
    const page = parseInt(query.page ?? '1', 10);
    const limit = parseInt(query.limit ?? '20', 10);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) where.status = query.status;
    if (query.employeeId) where.employeeId = query.employeeId;

    if (query.dateFrom || query.dateTo) {
      where.weekStartDate = {};
      if (query.dateFrom) where.weekStartDate.gte = new Date(query.dateFrom);
      if (query.dateTo) where.weekStartDate.lte = new Date(query.dateTo);
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.timesheet.count({ where }),
      this.prisma.timesheet.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: { id: true, name: true } },
          entries: { select: { totalHours: true } },
        },
      }),
    ]);

    const enriched = data.map((ts) => ({
      ...ts,
      totalHours: ts.entries.reduce((sum, e) => sum + e.totalHours, 0),
      entryCount: ts.entries.length,
      entries: undefined, // Don't send full entries in list
    }));

    return {
      data: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── FIND ONE ──────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const timesheet = await this.prisma.timesheet.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, name: true, phone: true } },
        entries: { orderBy: { date: 'asc' } },
      },
    });

    if (!timesheet) {
      throw new NotFoundException(`Stundenzettel mit ID ${id} nicht gefunden`);
    }

    return timesheet;
  }

  // ─── DELETE ────────────────────────────────────────────────────────────────

  async delete(id: string, actorId: string) {
    const timesheet = await this.prisma.timesheet.findUnique({ where: { id } });

    if (!timesheet) {
      throw new NotFoundException(`Stundenzettel mit ID ${id} nicht gefunden`);
    }

    if (timesheet.status === TimesheetStatus.CONFIRMED) {
      throw new BadRequestException(
        'Bestätigte Stundenzettel können nicht gelöscht werden',
      );
    }

    await this.prisma.timesheet.delete({ where: { id } });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId,
        action: 'TIMESHEET_DELETE',
        details: `Stundenzettel "${id}" für "${timesheet.employeeName}" gelöscht`,
      },
    });

    return { message: 'Stundenzettel erfolgreich gelöscht' };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private validateEntry(entry: {
    startTime: string;
    endTime: string;
    breakMinutes: number;
    totalHours: number;
  }) {
    const [startH, startM] = entry.startTime.split(':').map(Number);
    const [endH, endM] = entry.endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (endMinutes <= startMinutes) {
      throw new BadRequestException(
        `Endzeit (${entry.endTime}) muss nach Startzeit (${entry.startTime}) liegen`,
      );
    }

    const netMinutes = endMinutes - startMinutes - entry.breakMinutes;
    const calculatedHours = netMinutes / 60;
    const diff = Math.abs(calculatedHours - entry.totalHours);

    if (diff > 0.2) {
      throw new BadRequestException(
        `Stundenberechnung inkonsistent: ${entry.startTime}–${entry.endTime} minus ${entry.breakMinutes} Min Pause ergibt ${calculatedHours.toFixed(2)} h, nicht ${entry.totalHours} h`,
      );
    }
  }

  private deriveWeekStart(ocrResult: { entries: Array<{ date: string }> }): Date {
    if (ocrResult.entries.length > 0) {
      const firstDate = new Date(ocrResult.entries[0].date);
      if (!isNaN(firstDate.getTime())) {
        // Find the Monday of that week
        const day = firstDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const distToMonday = day === 0 ? 6 : day - 1;
        const monday = new Date(firstDate);
        monday.setUTCDate(monday.getUTCDate() - distToMonday);
        monday.setUTCHours(0, 0, 0, 0);
        return monday;
      }
    }

    // Fallback: current week's Monday
    const now = new Date();
    const day = now.getUTCDay();
    const distToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setUTCDate(monday.getUTCDate() - distToMonday);
    monday.setUTCHours(0, 0, 0, 0);
    return monday;
  }

  private getKw(date: Date): string {
    const startOfYear = new Date(date.getUTCFullYear(), 0, 1);
    const diff = (date.getTime() - startOfYear.getTime()) / 86400000;
    const week = Math.ceil((diff + startOfYear.getDay() + 1) / 7);
    return `${week}/${date.getUTCFullYear()}`;
  }
}
