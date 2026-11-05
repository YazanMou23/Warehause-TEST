import { WorkHoursService } from './work-hours.service';
import { AttendanceService } from '../attendance/attendance.service';
import { TimesheetService } from '../timesheet/timesheet.service';
import { TimesheetExportService } from '../timesheet/timesheet-export.service';
import { WhatsappSelfServiceService } from '../messaging/whatsapp-self-service.service';
import { UsersService } from '../users/users.service';
import { Role } from '@prisma/client';
import * as ExcelJS from 'exceljs';

describe('single posted hours ledger: all services share Attendance (offline)', () => {
  const worker = {
    id: 'worker',
    name: 'Synthetic Worker',
    phone: '+491701234567',
    role: Role.EMPLOYEE,
    isActive: true,
  };
  const start = new Date('2026-11-01Z'),
    end = new Date('2026-11-30T23:59:59.999Z');
  const sheet = {
    id: 'sheet',
    employeeId: 'worker',
    employeeName: 'Synthetic Worker',
    employee: worker,
    status: 'CONFIRMED',
    weekStartDate: new Date('2026-11-02Z'),
    entries: [
      {
        id: 'stale-ocr',
        date: new Date('2026-11-03Z'),
        startTime: '00:00',
        endTime: '23:00',
        totalHours: 999,
        isActive: true,
      },
    ],
  };
  let rows: any[],
    db: any,
    hours: WorkHoursService,
    attendance: AttendanceService,
    timesheets: TimesheetService,
    exports: TimesheetExportService,
    bot: WhatsappSelfServiceService,
    users: UsersService;
  const matches = (r: any, w: any = {}) =>
    Object.entries(w).every(([k, v]: any) => {
      if (v === undefined) return true;
      if (v instanceof Date) return new Date(r[k]).getTime() === v.getTime();
      if (v && typeof v === 'object') {
        const n = new Date(r[k]).getTime();
        return (
          (!v.gte || n >= v.gte.getTime()) &&
          (!v.lte || n <= v.lte.getTime()) &&
          (!v.lt || n < v.lt.getTime())
        );
      }
      return r[k] === v;
    });
  afterEach(() => jest.useRealTimers());
  beforeEach(() => {
    rows = [];
    db = {
      user: {
        findFirst: jest.fn().mockResolvedValue(worker),
        findUnique: jest
          .fn()
          .mockResolvedValue({ warehouseId: 'wh', hallId: 'hall' }),
        findMany: jest.fn().mockResolvedValue([worker]),
      },
      warehouse: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'wh',
            name: 'Synthetic site',
            halls: [{ id: 'hall' }],
          }),
      },
      hall: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'hall',
            warehouse: { name: 'Synthetic site' },
          }),
      },
      notification: { create: jest.fn().mockResolvedValue({}) },
      actionLog: { create: jest.fn().mockResolvedValue({}) },
      employeeAbsence: { findMany: jest.fn().mockResolvedValue([]) },
      planEmployee: { findMany: jest.fn().mockResolvedValue([]) },
      plan: { findMany: jest.fn().mockResolvedValue([]) },
      attendance: {},
      timesheet: {
        findUnique: jest.fn().mockResolvedValue(sheet),
        findMany: jest.fn().mockResolvedValue([sheet]),
        count: jest.fn().mockResolvedValue(1),
      },
      timesheetEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    db.attendance.findMany = jest.fn(async ({ where }: any = {}) =>
      rows
        .filter((r) => matches(r, where))
        .map((r) => ({
          ...r,
          warehouse: { name: 'Synthetic site' },
          hall: { name: 'Hall' },
        })),
    );
    db.attendance.findFirst = jest.fn(
      async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null,
    );
    db.attendance.findUnique = jest.fn(
      async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null,
    );
    db.attendance.count = jest.fn(
      async ({ where }: any) => rows.filter((r) => matches(r, where)).length,
    );
    db.attendance.create = jest.fn(async ({ data }: any) => {
      if (rows.some((r) => r.id === data.id)) throw { code: 'P2002' };
      const r = {
        id: data.id ?? `row-${rows.length}`,
        clockOut: null,
        totalHours: null,
        warehouse: { name: 'Synthetic site' },
        hall: { name: 'Hall' },
        source: 'MANUAL',
        ...data,
      };
      rows.push(r);
      return r;
    });
    db.attendance.update = jest.fn(async ({ where, data }: any) => {
      const r = rows.find((r) => r.id === where.id);
      Object.assign(
        r,
        Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== undefined),
        ),
      );
      return r;
    });
    db.attendance.delete = jest.fn(async ({ where }: any) => {
      const r = rows.find((r) => r.id === where.id);
      rows = rows.filter((r) => r.id !== where.id);
      return r;
    });
    db.$transaction = jest.fn(async (f: any) => {
      if (Array.isArray(f)) return Promise.all(f);
      const before = rows.map((r) => ({ ...r }));
      try {
        return await f(db);
      } catch (e) {
        rows = before;
        throw e;
      }
    });
    hours = new WorkHoursService(db);
    const settings: any = {
      isWorkHoursHiddenForEmployee: jest.fn().mockResolvedValue(false),
    };
    attendance = new AttendanceService(db, settings, hours);
    timesheets = new TimesheetService(db, {} as any, {} as any, hours);
    exports = new TimesheetExportService(db, hours);
    bot = new WhatsappSelfServiceService(db, timesheets, {} as any);
    users = new UsersService(db, {} as any, settings, hours);
  });
  async function assertViews(expected: number) {
    const report = await attendance.getMonthlyReport('worker', 2026, 11);
    expect(report.totalHours).toBe(expected);
    const ledger = await timesheets.getWorkerTimesheetHoursForPeriod(
      'worker',
      start,
      end,
    );
    expect(ledger.totalHours ?? 0).toBe(expected);
    const projected = await timesheets.findOne('sheet');
    expect(
      projected.entries.reduce((s: number, e: any) => s + e.totalHours, 0),
    ).toBe(expected);
    expect(projected.entries.some((e: any) => e.id === 'stale-ocr')).toBe(
      false,
    );
    const page = await timesheets.findAll({} as any);
    expect(page.data[0].totalHours).toBe(expected);
    const reply = await bot.handleIncomingConversation(
      worker.phone,
      'ساعاتي شهر 11 من سنة 2026',
      new Date('2026-11-05T12:00Z'),
      'ar',
    );
    expect(reply.totalHours ?? 0).toBe(expected);
    const summary = await users.getEmployeeDashboardSummary('worker');
    expect(summary.hoursSummary!.total).toBe(expected);
    const xlsx = await exports.exportXlsx('sheet');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx as any);
    // Export's source projection is verified directly plus a parseable spreadsheet.
    expect(wb.worksheets.length).toBeGreaterThan(0);
    const dataSheet = wb.worksheets[0];
    expect(
      dataSheet.getRow(7 + projected.entries.length).getCell(6).value,
    ).toBe(expected);
    const exportData = await (exports as any).loadTimesheet('sheet');
    expect(exportData.totalHours).toBe(expected);
  }
  it('manual add, attendance edit, timesheet-view edit, delete all yield the same numbers everywhere', async () => {
    const record = await attendance.createManualEntry(
      {
        employeeId: 'worker',
        warehouseId: 'wh',
        hallId: 'hall',
        clockIn: '2026-11-03T07:00Z',
        clockOut: '2026-11-03T15:00Z',
        totalHours: 8,
        breakMinutes: 0,
        date: '2026-11-03',
      },
      Role.MANAGER,
    );
    await assertViews(8);
    await attendance.updateAttendance(record.id, {
      clockIn: '2026-11-03T07:00Z',
      clockOut: '2026-11-03T14:00Z',
      totalHours: 7,
      breakMinutes: 0,
      date: '2026-11-03',
    });
    await assertViews(7);
    await timesheets.updateEntry(
      'sheet',
      record.id,
      { totalHours: 6 },
      'manager',
    );
    await assertViews(6);
    await attendance.deleteAttendance(record.id, 'manager', Role.MANAGER);
    await assertViews(0);
    expect(db.timesheetEntry.update).not.toHaveBeenCalled();
  });
  it('confirmed OCR posts once, draft edits stay outside totals, repeated confirm cannot restore deleted hours', async () => {
    const draft = { ...sheet, status: 'PENDING_REVIEW', entries: [] };
    db.timesheet.findUnique.mockImplementation(async () => draft);
    db.timesheet.updateMany = jest.fn(async () => {
      if (draft.status !== 'PENDING_REVIEW') return { count: 0 };
      draft.status = 'CONFIRMED';
      return { count: 1 };
    });
    db.timesheet.update = jest.fn(async ({ data }: any) => {
      Object.assign(draft, data);
      return draft;
    });
    await expect(
      hours.hoursForPeriod('worker', start, end),
    ).resolves.toMatchObject({ hasRecords: false });
    const dto: any = {
      employeeId: 'worker',
      entries: [
        {
          weekday: 'Dienstag',
          date: '2026-11-03',
          startTime: '08:00',
          endTime: '16:00',
          breakMinutes: 0,
          totalHours: 8,
          isActive: true,
        },
      ],
    };
    await timesheets.confirmTimesheet('sheet', dto, 'manager');
    await assertViews(8);
    await expect(
      timesheets.confirmTimesheet('sheet', dto, 'manager'),
    ).rejects.toThrow('Already posted');
    await timesheets.updateEntry(
      'sheet',
      rows[0].id,
      { isActive: false },
      'manager',
    );
    await assertViews(0);
    await expect(
      timesheets.confirmTimesheet('sheet', dto, 'manager'),
    ).rejects.toThrow('Already posted');
    expect(rows).toHaveLength(0);
  });
  it('clock-in/out and QR post through the same service and totals', async () => {
    jest.useFakeTimers({
      now: new Date('2026-11-03T07:00Z'),
      doNotFake: ['nextTick', 'setImmediate'],
    });
    await attendance.clockIn({
      employeeId: 'worker',
      warehouseId: 'wh',
      hallId: 'hall',
    });
    jest.setSystemTime(new Date('2026-11-03T15:00Z'));
    await attendance.clockOut({ employeeId: 'worker' } as any);
    await assertViews(8);
    rows = [];
    jest.setSystemTime(new Date('2026-11-03T07:00Z'));
    await attendance.qrScan('worker', {
      warehouseId: 'wh',
      hallId: 'hall',
    } as any);
    jest.setSystemTime(new Date('2026-11-03T15:00Z'));
    await attendance.qrScan('worker', {
      warehouseId: 'wh',
      hallId: 'hall',
    } as any);
    await assertViews(8);
    jest.useRealTimers();
  });
  it('foreign worker rows never contribute, and drafts are not posted', async () => {
    rows.push({
      id: 'foreign',
      employeeId: 'other',
      date: new Date('2026-11-03Z'),
      clockIn: new Date('2026-11-03T08:00Z'),
      totalHours: 99,
    });
    await assertViews(0);
  });
  it('failed posted edit rolls back the ledger instead of leaving half-synced hours', async () => {
    const row = await hours.create({
      data: {
        employeeId: 'worker',
        warehouseId: 'wh',
        hallId: 'hall',
        date: new Date('2026-11-03Z'),
        clockIn: new Date('2026-11-03T07:00Z'),
        clockOut: new Date('2026-11-03T15:00Z'),
        totalHours: 8,
        breakMinutes: 0,
      },
    });
    db.actionLog.create.mockRejectedValueOnce(new Error('audit failed'));
    await expect(
      timesheets.updateEntry('sheet', row.id, { totalHours: 5 }, 'manager'),
    ).rejects.toThrow('audit failed');
    await assertViews(8);
  });
  it('draft edit never changes registered ledger totals', async () => {
    const draft = { ...sheet, status: 'PENDING_REVIEW' };
    db.timesheet.findUnique.mockResolvedValue(draft);
    db.timesheetEntry.findFirst.mockResolvedValue(draft.entries[0]);
    db.timesheetEntry.update.mockResolvedValue({
      ...draft.entries[0],
      totalHours: 9,
    });
    await timesheets.updateEntry(
      'sheet',
      'stale-ocr',
      { totalHours: 9 },
      'manager',
    );
    expect(rows).toHaveLength(0);
    expect((await hours.hoursForPeriod('worker', start, end)).hasRecords).toBe(
      false,
    );
  });
  it('missing OCR warehouse aborts confirmation rather than silently omitting posted rows', async () => {
    const draft = { ...sheet, status: 'PENDING_REVIEW' };
    db.timesheet.findUnique.mockResolvedValue(draft);
    db.timesheet.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    db.user.findUnique.mockResolvedValue({});
    db.warehouse.findFirst.mockResolvedValue(null);
    await expect(
      timesheets.confirmTimesheet(
        'sheet',
        {
          employeeId: 'worker',
          entries: [
            {
              weekday: 'Di',
              date: '2026-11-03',
              startTime: '08:00',
              endTime: '16:00',
              totalHours: 8,
              breakMinutes: 0,
            },
          ],
        } as any,
        'manager',
      ),
    ).rejects.toThrow('Warehouse/hall required');
    expect(rows).toHaveLength(0);
  });
  it('rejects malformed values, resolves overnight and explicit DST ambiguity without guessing', () => {
    expect(
      hours.calculate(
        new Date('2026-11-03T22:00Z'),
        new Date('2026-11-04T06:00Z'),
        30,
      ),
    ).toBe(7.5);
    expect(() =>
      hours.clockOnWorkDate(new Date('2026-10-25Z'), '02:30', 'MANUAL'),
    ).toThrow('Ambiguous');
    expect(() =>
      hours.clockOnWorkDate(new Date('2026-03-29Z'), '02:30', 'MANUAL'),
    ).toThrow('Ambiguous');
  });
  it('second simultaneous OCR confirmation loses atomic status claim',async()=>{
    const draft={...sheet,status:'PENDING_REVIEW',entries:[]};db.timesheet.findUnique.mockImplementation(async()=>draft);
    db.timesheet.updateMany=jest.fn(async()=>{if(draft.status!=='PENDING_REVIEW')return {count:0};draft.status='CONFIRMED';return {count:1};});
    db.timesheet.update=jest.fn(async({data}:any)=>{Object.assign(draft,data);return draft;});
    const dto:any={employeeId:'worker',entries:[{weekday:'Di',date:'2026-11-03',startTime:'08:00',endTime:'16:00',breakMinutes:0,totalHours:8}]};
    const results=await Promise.allSettled([timesheets.confirmTimesheet('sheet',dto,'manager'),timesheets.confirmTimesheet('sheet',dto,'manager')]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(rows).toHaveLength(1);await assertViews(8);
  });
  it('invalid values and out-of-week OCR cannot post',async()=>{
    await expect(hours.create({data:{totalHours:NaN}})).rejects.toThrow('Invalid registered hours');
    await expect(hours.create({data:{totalHours:-1}})).rejects.toThrow('Invalid registered hours');
    db.timesheet.findUnique.mockResolvedValue({...sheet,status:'PENDING_REVIEW'});
    await expect(timesheets.confirmTimesheet('sheet',{employeeId:'worker',entries:[{weekday:'Mo',date:'2026-11-09',startTime:'08:00',endTime:'16:00',totalHours:8}]} as any,'manager')).rejects.toThrow('within the sheet week');expect(rows).toHaveLength(0);
  });

});
