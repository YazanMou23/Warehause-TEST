import { WorkHoursService } from '../work-hours/work-hours.service';
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
import { randomUUID } from 'crypto';

@Injectable()
export class TimesheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ocrService: TimesheetOcrService,
    private readonly matcherService: TimesheetMatcherService,
    private readonly hours: WorkHoursService = new WorkHoursService(prisma),
  ) {}

  // ─── SCAN & CREATE ─────────────────────────────────────────────────────────

  async scanAndCreate(
    file: Express.Multer.File,
    creatorId: string,
    uploadJobId?: string,
    sourcePage?: number,
  ) {
    // Idempotency guard: if this page already produced a scan record for this
    // upload job, return it instead of creating a duplicate (prevents retries or
    // a refresh from inserting the same page twice).
    if (uploadJobId && sourcePage != null) {
      const existing = await this.prisma.timesheet.findFirst({
        where: {
          uploadJobId,
          sourcePage,
        },
        include: {
          entries: { orderBy: { date: 'asc' } },
          employee: { select: { id: true, name: true } },
        },
      });
      if (existing) {
        if (existing.status === TimesheetStatus.CONFIRMED) {
          return {
            ...existing,
            employeeMatch: {
              found: !!existing.employeeId,
              confidence: (existing.ocrConfidence as 'exact' | 'fuzzy' | 'none') ?? 'none',
              matchedName: existing.employee?.name ?? null,
              isNewEmployee: !existing.employeeId,
            },
            ocrWarning: 'Dieser Stundenzettel wurde bereits bestätigt.',
            sandbox: (existing.ocrRawResponse as any)?.sandbox ?? false,
          };
        }
        // If still pending review (e.g. user retrying or re-analyzing), remove old draft so fresh scan replaces it
        await this.prisma.timesheet.delete({ where: { id: existing.id } }).catch(() => {});
      }
    }

    // 0. Fetch candidate employee names for OCR guidance (prevents extracting company/agency names)
    const activeEmployees = await this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const candidateNames = activeEmployees.map((e) => e.name).filter(Boolean);

    // 1. OCR extraction (providing active employees as candidates)
    const ocrResult = await this.ocrService.extractFromFile(file, candidateNames);

    // 2. Fuzzy employee matching against the database
    const matchResult = await this.matcherService.findBestMatch(ocrResult.employeeName);

    // 3. Derive week start (Monday) from first entry date if available
    const weekStartDate = this.deriveWeekStart(ocrResult);

    // 4. Guarantee all 7 calendar week days (Montag - Sonntag) exist
    const weekDays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    const entriesData = weekDays.map((weekdayName, i) => {
      const dayDate = new Date(weekStartDate);
      dayDate.setUTCDate(dayDate.getUTCDate() + i);
      const dayDateStr = dayDate.toISOString().slice(0, 10);
      const matchedOcr = ocrResult.entries.find(
        (e) => e.weekday?.toLowerCase() === weekdayName.toLowerCase() || e.date === dayDateStr
      );

      if (matchedOcr && matchedOcr.startTime?.trim()) {
        return {
          weekday: weekdayName,
          date: dayDate,
          startTime: matchedOcr.startTime.trim(),
          endTime: matchedOcr.endTime?.trim() || null,
          breakMinutes: matchedOcr.breakMinutes || 0,
          totalHours: matchedOcr.totalHours || 0,
          location: matchedOcr.location || null,
          isActive: true,
        };
      }

      return {
        weekday: weekdayName,
        date: dayDate,
        startTime: '',
        endTime: null,
        breakMinutes: 0,
        totalHours: 0,
        location: null,
        isActive: false,
      };
    });

    // 5. Store timesheet in PENDING_REVIEW state (scoped to upload job/page
    //    when provided, so the page can never be inserted twice)
    const resolvedEmployeeName = (matchResult.found && matchResult.matchedName)
      ? matchResult.matchedName
      : (ocrResult.employeeName || 'Unbekannter Mitarbeiter');

    let timesheet: any;
    try {
      timesheet = await this.prisma.timesheet.create({
        data: {
          employeeName: resolvedEmployeeName,
          employeeId: matchResult.found ? matchResult.employeeId ?? null : null,
          weekStartDate,
          status: TimesheetStatus.PENDING_REVIEW,
          createdById: creatorId,
          ocrConfidence: matchResult.confidence,
          ocrRawResponse: ocrResult as any,
          uploadJobId: uploadJobId ?? null,
          sourcePage: sourcePage ?? null,
          entries: {
            create: entriesData,
          },
        },
        include: {
          entries: { orderBy: { date: 'asc' } },
          employee: { select: { id: true, name: true } },
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002' && uploadJobId && sourcePage != null) {
        const fallback = await this.prisma.timesheet.findFirst({
          where: { uploadJobId, sourcePage },
          include: {
            entries: { orderBy: { date: 'asc' } },
            employee: { select: { id: true, name: true } },
          },
        });
        if (fallback) {
          return {
            ...fallback,
            employeeMatch: {
              found: !!fallback.employeeId,
              confidence: (fallback.ocrConfidence as 'exact' | 'fuzzy' | 'none') ?? 'none',
              matchedName: fallback.employee?.name ?? null,
              isNewEmployee: !fallback.employeeId,
            },
            ocrWarning: fallback.status === TimesheetStatus.CONFIRMED
              ? 'Dieser Stundenzettel wurde bereits bestätigt.'
              : (fallback.ocrRawResponse as any)?.warning,
            sandbox: (fallback.ocrRawResponse as any)?.sandbox ?? false,
          };
        }
      }
      throw err;
    }

    // 6. Log action
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

    if (timesheet.status === TimesheetStatus.CONFIRMED) throw new ConflictException('Already posted: edit registered entries instead of confirming again');

    // ── Validate active working entries ─────────────────────────────────────
    const activeWorkingEntries = dto.entries.filter(
      (e) => e.isActive !== false && e.startTime?.trim(),
    );

    for (const entry of activeWorkingEntries) {
      this.validateEntry({...entry,startTime:entry.startTime!,breakMinutes:entry.breakMinutes??0,totalHours:entry.totalHours??this.calculateHours(entry.startTime!,entry.endTime??'',entry.breakMinutes??0)});
    }

    const weekStart = dto.weekStartDate ? new Date(dto.weekStartDate) : new Date(timesheet.weekStartDate);
    weekStart.setUTCHours(0,0,0,0);const weekEnd=new Date(weekStart);weekEnd.setUTCDate(weekEnd.getUTCDate()+7);
    if(dto.entries.some(e=>!Number.isFinite(new Date(e.date).getTime()) || new Date(e.date)<weekStart || new Date(e.date)>=weekEnd))throw new BadRequestException('Entry date must be within the sheet week');

    // ── Persist in transaction ───────────────────────────────────────────────
    const updated: any = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.timesheet.updateMany({where:{id,status:TimesheetStatus.PENDING_REVIEW},data:{status:TimesheetStatus.CONFIRMED}});
      if(claimed.count !== 1) throw new ConflictException('Timesheet already posted');
      // ── Resolve employee ─────────────────────────────────────────────────────
      let employeeId: string;

      if (dto.employeeId) {
        // Verify employee exists
        const emp = await tx.user.findFirst({
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
        const existing = await tx.user.findFirst({
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
        const createdUser = await tx.user.create({
          data: {
            username: newEmp.username,
            name: newEmp.name,
            phone: newEmp.phone,
            passwordHash,
            role: Role.EMPLOYEE,
          },
        });

        await tx.actionLog.create({
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


      // Existing posted rows on a draft are inconsistent; never delete them silently.
      if(await tx.attendance.count({where:{timesheetId:id}})) throw new ConflictException('Draft already has posted hours; reconcile first');

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

      // 4. Create all 7 weekly Timesheet entries & Attendance records for active days
      const entriesToCreate = [];
      const attendanceToCreate = [];

      for (const e of dto.entries) {
        const isEntryActive = e.isActive !== false;
        const startTimeVal = e.startTime?.trim() || '';
        const endTimeVal = e.endTime?.trim() || null;
        const breakMinVal = Number(e.breakMinutes) || 0;
        const totalHoursVal = isEntryActive ? (e.totalHours ?? this.calculateHours(startTimeVal,endTimeVal??'',breakMinVal)) : 0;
        const locationVal = e.location?.trim() || null;

        const sourceEntryId = randomUUID();
        entriesToCreate.push({
          id: sourceEntryId,
          weekday: e.weekday,
          date: new Date(e.date),
          startTime: startTimeVal,
          endTime: endTimeVal,
          breakMinutes: breakMinVal,
          totalHours: totalHoursVal,
          location: locationVal,
          isActive: isEntryActive,
        });

        // Only create attendance record if day is active and has a valid start time
        if (isEntryActive && startTimeVal) {
          let entryWhId = emp?.warehouseId || fallbackWhId;
          let entryHallId = emp?.hallId || fallbackHallId;

          if (locationVal) {
            const matchedWh = await tx.warehouse.findFirst({
              where: {
                name: { contains: locationVal, mode: 'insensitive' },
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

          if (!entryWhId || !entryHallId) throw new BadRequestException('Warehouse/hall required to post hours');
          if (entryWhId && entryHallId) {
            const [startH, startM] = startTimeVal.split(':').map(Number);
            const clockIn = new Date(e.date);
            clockIn.setUTCHours(startH || 0, startM || 0, 0, 0);

            let clockOut: Date | null = null;
            if (endTimeVal) {
              const [endH, endM] = endTimeVal.split(':').map(Number);
              clockOut = new Date(e.date);
              clockOut.setUTCHours(endH || 0, endM || 0, 0, 0);
              if(clockOut < clockIn) clockOut.setUTCDate(clockOut.getUTCDate()+1);
            }

            attendanceToCreate.push({
              id: this.hours.entryAttendanceId(sourceEntryId),
              employeeId,
              warehouseId: entryWhId,
              hallId: entryHallId,
              clockIn,
              clockOut,
              totalHours: totalHoursVal,
              breakMinutes: breakMinVal,
              source: 'SCAN',
              date: new Date(e.date),
              timesheetId: id,
            });
          }
        }
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
        await this.hours.create({ data: att }, tx);
      }

    // ── Audit log ────────────────────────────────────────────────────────────
    await tx.actionLog.create({
      data: {
        userId: actorId,
        action: 'TIMESHEET_CONFIRM',
        details: `Stundenzettel "${id}" bestätigt für Mitarbeiter "${confirmed.employee?.name ?? confirmed.employeeName}" (${activeWorkingEntries.length} aktive Tage, ${activeWorkingEntries.reduce((s, e) => s + (e.totalHours || 0), 0).toFixed(2)} h)`,
      },
    });

      return this.hours.projectTimesheet(confirmed,tx);
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

    const enriched = await Promise.all(data.map(async (ts) => {
      const projected = await this.hours.projectTimesheet(ts);
      return { ...projected, totalHours: projected.hoursSource==='ATTENDANCE' ? projected.totalHours : this.calculateTimesheetTotalHours(projected.entries as any), entryCount: projected.entries.filter((e:any)=>e.isActive!==false && e.startTime?.trim()).length };
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

    return this.hours.projectTimesheet(timesheet);
  }

  // ─── UPDATE PENDING (patch header) ────────────────────────────────────────

  /**
   * PATCH /timesheets/:id
   * Update header fields (employeeName, weekStartDate, employeeId) for PENDING_REVIEW timesheets. Posted headers are fixed.
   */
  async updatePending(id: string, dto: UpdateTimesheetDto, actorId: string) {
    const timesheet = await this.prisma.timesheet.findUnique({
      where: { id },
      include: { entries: { orderBy: { date: 'asc' } }, employee: { select: { id: true, name: true } } },
    });

    if (!timesheet) {
      throw new NotFoundException(`Stundenzettel mit ID ${id} nicht gefunden`);
    }

    if(timesheet.status===TimesheetStatus.CONFIRMED) throw new BadRequestException('Posted header is fixed; edit registered hours entries');

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
    const timesheet = await this.prisma.timesheet.findUnique({
      where: { id: timesheetId },
      include: { employee: { select: { id: true, name: true, warehouseId: true, hallId: true } } },
    });
    if (!timesheet) {
      throw new NotFoundException(`Stundenzettel mit ID ${timesheetId} nicht gefunden`);
    }

    if(timesheet.status===TimesheetStatus.CONFIRMED) {
      if(!timesheet.employeeId) throw new ConflictException('Posted timesheet has no employee');
      const ledgerEmployeeId=timesheet.employeeId;
      return this.prisma.$transaction(async tx=>{
        // Projected confirmed rows use Attendance.id only. Stale source IDs must not recreate hours.
        const weekStart=new Date(timesheet.weekStartDate);weekStart.setUTCHours(0,0,0,0);const weekEnd=new Date(weekStart);weekEnd.setUTCDate(weekEnd.getUTCDate()+7);
        let posted = await tx.attendance.findFirst({where:{id:entryId,employeeId:ledgerEmployeeId,date:{gte:weekStart,lt:weekEnd}}});
        if(!posted) throw new NotFoundException('Registered hours entry not found; never recreate from stale OCR');
        if(dto.isActive===false) { await this.hours.delete({where:{id:posted.id}},tx);await tx.actionLog.create({data:{userId:actorId,action:'REGISTERED_HOURS_DELETE',details:'Posted hours deleted from timesheet view'}}); return {...posted,isActive:false,totalHours:0}; }
        const date = dto.date ? new Date(dto.date) : posted.date;
        if(date<weekStart || date>=weekEnd)throw new BadRequestException('Entry date must stay within sheet week; use attendance editor to move it');
        const start = dto.startTime ?? this.hours.displayTime(posted.clockIn,posted.source);
        const end = dto.endTime ?? (posted.clockOut?this.hours.displayTime(posted.clockOut,posted.source):null);
        const clockIn = dto.startTime===undefined && dto.date===undefined ? posted.clockIn : this.hours.clockOnWorkDate(date,start,posted.source);
        let clockOut:Date|null=null;
        if(end) { clockOut=dto.endTime===undefined && dto.date===undefined ? posted.clockOut : this.hours.clockOnWorkDate(date,end,posted.source);if(clockOut && clockOut<clockIn) {const tomorrow=new Date(date);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);clockOut=this.hours.clockOnWorkDate(tomorrow,end,posted.source);} }
        const breakMinutes=dto.breakMinutes??posted.breakMinutes;
        const totalHours=dto.totalHours??this.hours.calculate(clockIn,clockOut,breakMinutes);
        let warehouseId=posted.warehouseId,hallId=posted.hallId;
        if(dto.location?.trim()) {
          const wh=await tx.warehouse.findFirst({where:{name:dto.location.trim(),deletedAt:null},include:{halls:{where:{deletedAt:null}}}});
          if(!wh) throw new BadRequestException('Choose a warehouse/hall in attendance editor');
          warehouseId=wh.id;hallId=wh.halls.some(h=>h.id===hallId)?hallId:wh.halls.length===1?wh.halls[0].id:'';
          if(!hallId)throw new BadRequestException('Choose hall in attendance editor');
        }
        const updated=await this.hours.update({where:{id:posted.id},data:{date,clockIn,clockOut,breakMinutes,totalHours,warehouseId,hallId}},tx);
        await tx.actionLog.create({data:{userId:actorId,action:'REGISTERED_HOURS_UPDATE',details:'Posted hours updated from timesheet view'}});
        return {id:updated.id,date:updated.date,startTime:this.hours.displayTime(updated.clockIn,updated.source),endTime:updated.clockOut?this.hours.displayTime(updated.clockOut,updated.source):null,breakMinutes:updated.breakMinutes,totalHours:updated.totalHours,isActive:true};
      });
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
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const isEntryActive = updateData.isActive !== undefined ? updateData.isActive : entry.isActive;

    // Auto-recalculate totalHours when times change and totalHours not explicitly sent
    if (!isEntryActive) {
      updateData.totalHours = 0;
    } else if (dto.totalHours !== undefined) {
      updateData.totalHours = dto.totalHours;
    } else if (dto.startTime !== undefined || dto.endTime !== undefined || dto.breakMinutes !== undefined) {
      const start = dto.startTime ?? entry.startTime;
      const end = dto.endTime ?? entry.endTime;
      const brk = dto.breakMinutes ?? entry.breakMinutes;
      updateData.totalHours = start && end ? this.calculateHours(start, end, brk) : 0;
    }

    const updated = await this.prisma.timesheetEntry.update({
      where: { id: entryId },
      data: updateData,
    });

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

  // ─── Shared Worker Timesheet Calculation & Read-Only Query ─────────────────

  /**
   * Calculates net hours for a start/end time string ("HH:mm") and break minutes,
   * using the exact worker timesheet formula.
   */
  calculateHours(startTime: string, endTime: string, breakMinutes = 0): number {
    if (!startTime?.trim() || !endTime?.trim()) return 0;
    const [startH, startM] = startTime.trim().split(':').map(Number);
    const [endH, endM] = endTime.trim().split(':').map(Number);
    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const span = endMinutes < startMinutes ? endMinutes + 1440 - startMinutes : endMinutes - startMinutes;
    return Math.max(0, Math.round((span - (Number(breakMinutes)||0)) / 60 * 100) / 100);

  }

  /**
   * Calculates hours for a single timesheet entry using the exact worker timesheet logic.
   */
  calculateEntryHours(entry: {
    startTime?: string | null;
    endTime?: string | null;
    breakMinutes?: number | null;
    totalHours?: number | null;
    isActive?: boolean | null;
  }): number {
    if (!entry || entry.isActive === false) return 0;
    if (typeof entry.totalHours === 'number' && Number.isFinite(entry.totalHours)) return Math.max(0, Math.round(entry.totalHours*100)/100);
    if (entry.startTime?.trim() && entry.endTime?.trim()) {
      return this.calculateHours(
        entry.startTime.trim(),
        entry.endTime.trim(),
        Number(entry.breakMinutes) || 0,
      );
    }
    if (typeof entry.totalHours === 'number' && !isNaN(entry.totalHours)) {
      return Math.max(0, Math.round(entry.totalHours * 100) / 100);
    }
    return 0;
  }

  /**
   * Sums active timesheet entries using the worker timesheet calculation.
   */
  calculateTimesheetTotalHours(
    entries: Array<{
      startTime?: string | null;
      endTime?: string | null;
      breakMinutes?: number | null;
      totalHours?: number | null;
      isActive?: boolean | null;
    }>,
  ): number {
    const sum = (entries || [])
      .filter((e) => e && e.isActive !== false)
      .reduce((acc, e) => acc + this.calculateEntryHours(e), 0);
    return Math.round(sum * 100) / 100;
  }

  /** Compatibility API: reads registered Attendance hours via the shared ledger. */
  async getWorkerTimesheetHoursForPeriod(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    hasRecords: boolean;
    totalHours: number | null;
    daysCount: number;
    entries: Array<{
      date: string;
      weekday: string;
      startTime: string;
      endTime: string;
      breakMinutes: number;
      hours: number;
      location: string | null;
    }>;
  }> {
    return this.hours.hoursForPeriod(employeeId,startDate,endDate);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private validateEntry(entry: {
    startTime: string;
    endTime?: string;
    breakMinutes: number;
    totalHours: number;
  }) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.startTime) || !Number.isFinite(entry.totalHours) || entry.totalHours<0 || entry.breakMinutes<0) throw new BadRequestException('Invalid hours entry');
    if (!entry.endTime?.trim()) return;

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.endTime.trim()) || !Number.isFinite(entry.totalHours) || entry.totalHours < 0 || entry.breakMinutes < 0) throw new BadRequestException('Invalid hours entry');

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
