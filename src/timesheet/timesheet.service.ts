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
import { UpdateTimesheetDto } from './dto/update-timesheet.dto';
import { UpdateTimesheetEntryDto } from './dto/update-timesheet-entry.dto';
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

    // ── Validate entries ────────────────────────────────────────────────────
    const validEntries = dto.entries.filter(
      (e) => e.startTime?.trim(),
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
    const weekStart = dto.weekStartDate ? new Date(dto.weekStartDate) : timesheet.weekStartDate;
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
    const updated: any = await this.prisma.$transaction(async (tx) => {
      // 1. Delete old attendance entries linked to this timesheet
      await tx.attendance.deleteMany({
        where: { timesheetId: id },
      });

      // 2. Delete old timesheet entries
      await tx.timesheetEntry.deleteMany({ where: { timesheetId: id } });

      // 3. Resolve employee default warehouse & hall if needed
      const emp = await tx.user.findUnique({
        where: { id: employeeId },
        select: { warehouseId: true, hallId: true },
      });

      // Find first fallback warehouse/hall
      let fallbackWhId: string | null = null;
      let fallbackHallId: string | null = null;
      const fallbackWh = await tx.warehouse.findFirst({
        where: { deletedAt: null },
        include: { halls: { where: { deletedAt: null } } },
      });
      if (fallbackWh) {
        fallbackWhId = fallbackWh.id;
        if (fallbackWh.halls && fallbackWh.halls.length > 0) {
          fallbackHallId = fallbackWh.halls[0].id;
        }
      }

      // 4. Create new Timesheet entries & Attendance records
      const entriesToCreate = [];
      const attendanceToCreate = [];

      for (const e of validEntries) {
        // Resolve warehouse and hall for this entry
        let entryWhId = emp?.warehouseId || fallbackWhId;
        let entryHallId = emp?.hallId || fallbackHallId;

        if (e.location?.trim()) {
          const matchedWh = await tx.warehouse.findFirst({
            where: {
              name: { contains: e.location.trim(), mode: 'insensitive' },
              deletedAt: null,
            },
            include: { halls: { where: { deletedAt: null } } },
          });
          if (matchedWh) {
            entryWhId = matchedWh.id;
            if (matchedWh.halls && matchedWh.halls.length > 0) {
              entryHallId = matchedWh.halls[0].id;
            }
          }
        }

        if (!entryWhId || !entryHallId) {
          throw new BadRequestException(
            `Kein Lager oder Halle für den Eintrag am ${e.date} gefunden. Bitte weise dem Mitarbeiter ein Standardlager zu oder erstelle ein Lager im System.`,
          );
        }

        // Parse startTime and optional endTime
        const [startH, startM] = e.startTime.split(':').map(Number);
        const clockIn = new Date(e.date);
        clockIn.setUTCHours(startH || 0, startM || 0, 0, 0);

        let clockOut: Date | null = null;
        if (e.endTime?.trim()) {
          const [endH, endM] = e.endTime.trim().split(':').map(Number);
          clockOut = new Date(e.date);
          clockOut.setUTCHours(endH || 0, endM || 0, 0, 0);
        }

        const trimmedEndTime = e.endTime?.trim() ? e.endTime.trim() : null;

        // Add to arrays
        entriesToCreate.push({
          weekday: e.weekday,
          date: new Date(e.date),
          startTime: e.startTime.trim(),
          endTime: trimmedEndTime,
          breakMinutes: e.breakMinutes ?? 0,
          totalHours: e.totalHours ?? 0,
          location: e.location?.trim() ?? null,
        });

        attendanceToCreate.push({
          employeeId,
          warehouseId: entryWhId,
          hallId: entryHallId,
          clockIn,
          clockOut,
          totalHours: e.totalHours ?? 0,
          breakMinutes: e.breakMinutes ?? 0,
          source: 'SCAN',
          date: new Date(e.date),
          timesheetId: id,
        });
      }

      // Save entries
      const confirmed = await tx.timesheet.update({
        where: { id },
        data: {
          employeeId,
          employeeName: dto.employeeName || timesheet.employeeName,
          weekStartDate: weekStart,
          status: TimesheetStatus.CONFIRMED,
          entries: {
            create: entriesToCreate,
          },
        },
        include: {
          entries: { orderBy: { date: 'asc' } },
          employee: { select: { id: true, name: true } },
        },
      });

      // Create attendance records
      for (const att of attendanceToCreate) {
        await tx.attendance.create({ data: att });
      }

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

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { employeeName: { contains: term, mode: 'insensitive' } },
        { employee: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

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
          employee: { select: { id: true, name: true, phone: true } },
          entries: { orderBy: { date: 'asc' } },
        },
      }),
    ]);

    const enriched = data.map((ts) => ({
      ...ts,
      totalHours: ts.entries.reduce((sum, e) => sum + e.totalHours, 0),
      entryCount: ts.entries.length,
      entries: ts.entries,
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

  // ─── UPDATE PENDING (patch header) ────────────────────────────────────────

  /**
   * PATCH /timesheets/:id
   * Update header fields (employeeName, weekStartDate, employeeId) for PENDING_REVIEW or CONFIRMED timesheets.
   */
  async updatePending(id: string, dto: UpdateTimesheetDto, actorId: string) {
    const timesheet = await this.prisma.timesheet.findUnique({
      where: { id },
      include: { entries: { orderBy: { date: 'asc' } }, employee: { select: { id: true, name: true } } },
    });

    if (!timesheet) {
      throw new NotFoundException(`Stundenzettel mit ID ${id} nicht gefunden`);
    }

    const updateData: any = {};
    if (dto.employeeName !== undefined) updateData.employeeName = dto.employeeName;
    if (dto.weekStartDate !== undefined) updateData.weekStartDate = new Date(dto.weekStartDate);

    const updated = await this.prisma.timesheet.update({
      where: { id },
      data: updateData,
      include: {
        entries: { orderBy: { date: 'asc' } },
        employee: { select: { id: true, name: true } },
      },
    });

    // If confirmed, update linked attendance employeeName/date references if needed
    if (timesheet.status === TimesheetStatus.CONFIRMED && timesheet.employeeId) {
      if (dto.weekStartDate) {
        // Shift attendance dates
        const diffDays = Math.round((new Date(dto.weekStartDate).getTime() - timesheet.weekStartDate.getTime()) / 86400000);
        if (diffDays !== 0) {
          const attendances = await this.prisma.attendance.findMany({ where: { timesheetId: id } });
          for (const att of attendances) {
            const newDate = new Date(att.date);
            newDate.setDate(newDate.getDate() + diffDays);
            const newClockIn = new Date(att.clockIn);
            newClockIn.setDate(newClockIn.getDate() + diffDays);
            const newClockOut = att.clockOut ? new Date(att.clockOut) : null;
            if (newClockOut) newClockOut.setDate(newClockOut.getDate() + diffDays);

            await this.prisma.attendance.update({
              where: { id: att.id },
              data: { date: newDate, clockIn: newClockIn, clockOut: newClockOut },
            });
          }
        }
      }
    }

    await this.prisma.actionLog.create({
      data: {
        userId: actorId,
        action: 'TIMESHEET_UPDATE_HEADER',
        details: `Stundenzettel "${id}" aktualisiert: ${Object.keys(updateData).join(', ')}`,
      },
    });

    return updated;
  }

  // ─── UPDATE ENTRY ──────────────────────────────────────────────────────────

  /**
   * PATCH /timesheets/:timesheetId/entries/:entryId
   * Patch a single entry row. Auto-recalculates totalHours if times change.
   */
  async updateEntry(
    timesheetId: string,
    entryId: string,
    dto: UpdateTimesheetEntryDto,
    actorId: string,
  ) {
    const timesheet = await this.prisma.timesheet.findUnique({ where: { id: timesheetId } });
    if (!timesheet) {
      throw new NotFoundException(`Stundenzettel mit ID ${timesheetId} nicht gefunden`);
    }

    const entry = await this.prisma.timesheetEntry.findFirst({
      where: { id: entryId, timesheetId },
    });
    if (!entry) {
      throw new NotFoundException(`Eintrag mit ID ${entryId} nicht gefunden`);
    }

    const updateData: any = {};
    if (dto.weekday !== undefined) updateData.weekday = dto.weekday;
    if (dto.date !== undefined) updateData.date = new Date(dto.date);
    if (dto.startTime !== undefined) updateData.startTime = dto.startTime.trim();
    if (dto.endTime !== undefined) updateData.endTime = dto.endTime.trim();
    if (dto.breakMinutes !== undefined) updateData.breakMinutes = dto.breakMinutes;
    if (dto.location !== undefined) updateData.location = dto.location.trim() || null;

    // Auto-recalculate totalHours when times change and totalHours not explicitly sent
    if (dto.totalHours !== undefined) {
      updateData.totalHours = dto.totalHours;
    } else if (dto.startTime !== undefined || dto.endTime !== undefined || dto.breakMinutes !== undefined) {
      const start = dto.startTime ?? entry.startTime;
      const end = dto.endTime ?? entry.endTime;
      const brk = dto.breakMinutes ?? entry.breakMinutes;
      if (start && end) {
        const [sH, sM] = start.split(':').map(Number);
        const [eH, eM] = end.split(':').map(Number);
        const netMin = (eH * 60 + eM) - (sH * 60 + sM) - brk;
        updateData.totalHours = Math.max(0, Math.round((netMin / 60) * 100) / 100);
      } else {
        updateData.totalHours = 0;
      }
    }

    const updated = await this.prisma.timesheetEntry.update({
      where: { id: entryId },
      data: updateData,
    });

    // If timesheet is confirmed and has employeeId, sync updates to Attendance record
    if (timesheet.status === TimesheetStatus.CONFIRMED && timesheet.employeeId) {
      const att = await this.prisma.attendance.findFirst({
        where: {
          timesheetId,
          date: new Date(entry.date),
        },
      });

      if (att) {
        const targetDate = updateData.date ? new Date(updateData.date) : new Date(att.date);
        const start = updateData.startTime ?? entry.startTime;
        const end = updateData.endTime ?? entry.endTime;
        const [sH, sM] = start ? start.split(':').map(Number) : [0, 0];

        const clockIn = new Date(targetDate);
        clockIn.setUTCHours(sH || 0, sM || 0, 0, 0);

        let clockOut: Date | null = null;
        if (end) {
          const [eH, eM] = end.split(':').map(Number);
          clockOut = new Date(targetDate);
          clockOut.setUTCHours(eH || 0, eM || 0, 0, 0);
        }

        let newWhId = att.warehouseId;
        let newHallId = att.hallId;
        if (updateData.location) {
          const matchedWh = await this.prisma.warehouse.findFirst({
            where: {
              name: { contains: updateData.location, mode: 'insensitive' },
              deletedAt: null,
            },
            include: { halls: { where: { deletedAt: null }, take: 1 } },
          });
          if (matchedWh) {
            newWhId = matchedWh.id;
            if (matchedWh.halls?.length > 0) {
              newHallId = matchedWh.halls[0].id;
            }
          }
        }

        await this.prisma.attendance.update({
          where: { id: att.id },
          data: {
            date: targetDate,
            clockIn,
            clockOut,
            breakMinutes: updateData.breakMinutes ?? att.breakMinutes,
            totalHours: updateData.totalHours ?? att.totalHours,
            warehouseId: newWhId,
            hallId: newHallId,
          },
        });
      }
    }

    await this.prisma.actionLog.create({
      data: {
        userId: actorId,
        action: 'TIMESHEET_ENTRY_UPDATE',
        details: `Eintrag "${entryId}" (Stundenzettel "${timesheetId}") aktualisiert: ${Object.keys(updateData).join(', ')}`,
      },
    });

    return updated;
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
    endTime?: string;
    breakMinutes: number;
    totalHours: number;
  }) {
    if (!entry.endTime?.trim()) return;
    const [startH, startM] = entry.startTime.split(':').map(Number);
    const [endH, endM] = entry.endTime.trim().split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (endMinutes <= startMinutes) {
      throw new BadRequestException(
        `Endzeit (${entry.endTime}) muss nach Startzeit (${entry.startTime}) liegen`,
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
