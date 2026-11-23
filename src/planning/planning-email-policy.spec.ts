import { PlanningService } from './planning.service';

// Synthetic records only. All provider and database operations are mocks.
describe('PLAN notifications use WhatsApp and in-app, not email', () => {
  const employee = { id: 'worker-synthetic', name: 'Test Worker', phone: '+491701234567', email: 'worker@example.invalid' };
  const plan = { id: 'plan-synthetic', date: new Date('2026-11-23T00:00:00Z'), shift: '06:00 - 14:00', warehouseName: 'Test Site', hallName: 'Test Hall', assignedEmployees: [employee] };
  let service: PlanningService;
  let prisma: any;
  let email: any;
  let messaging: any;
  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([employee]) },
      notification: { create: jest.fn().mockResolvedValue({}) },
      employeePlanSegment: { findMany: jest.fn().mockResolvedValue([]) },
      employeeAbsence: { findMany: jest.fn().mockResolvedValue([]) },
      actionLog: { create: jest.fn().mockResolvedValue({}) },
    };
    email = { sendPlanNotification: jest.fn(), sendPlanRemovalNotification: jest.fn(), sendPlanDeletionNotification: jest.fn(), sendWelcomeEmail: jest.fn(), sendPasswordResetEmail: jest.fn() };
    messaging = { sendShiftPlanNotification: jest.fn().mockResolvedValue({ success: true }), sendWhatsAppDirect: jest.fn().mockResolvedValue({ success: true }) };
    service = new PlanningService(prisma, email, messaging);
  });
  it.each([false, true])('suppresses assignment/update email (isUpdate=%s), preserving other channels', async (isUpdate) => {
    await (service as any).notifyAssignedEmployees(plan, [employee], isUpdate);
    expect(email.sendPlanNotification).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(messaging.sendShiftPlanNotification).toHaveBeenCalledWith(expect.objectContaining({ phone: employee.phone, planId: plan.id, employeeId: employee.id }));
  });
  it('suppresses removal email and retains WhatsApp and in-app notice', async () => {
    await (service as any).notifyRemovedEmployees(plan, [employee.id]);
    expect(email.sendPlanRemovalNotification).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(messaging.sendShiftPlanNotification).toHaveBeenCalledWith(expect.objectContaining({ event: 'REMOVED' }));
  });
  it('suppresses cancellation email and retains WhatsApp and in-app notice', async () => {
    await (service as any).notifyDeletedPlan(plan);
    expect(email.sendPlanDeletionNotification).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(messaging.sendShiftPlanNotification).toHaveBeenCalledWith(expect.objectContaining({ event: 'CANCELLED' }));
  });
  it('manual general resend cannot bypass email suppression', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(plan as any);
    await service.resendPlanNotification(plan.id);
    expect(email.sendPlanNotification).not.toHaveBeenCalled();
    expect(messaging.sendShiftPlanNotification).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });
  it('does not send an email when the worker has no phone', async () => {
    prisma.user.findMany.mockResolvedValue([{ ...employee, phone: null }]);
    await (service as any).notifyAssignedEmployees(plan, [{ ...employee, phone: null }], false);
    expect(messaging.sendShiftPlanNotification).not.toHaveBeenCalled();
    expect(email.sendPlanNotification).not.toHaveBeenCalled();
  });
});

describe('plan notification warnings are not silent', () => {
  const emp = { id: 'w', name: 'Max Beispiel', phone: '+491701234567' };
  const plan = { id: 'p', date: new Date('2026-11-24'), warehouseName: 'Nord', hallName: 'A', assignedEmployees: [emp], locations: [{ warehouseName: 'Nord', hallName: 'A', startTime: '06:00', endTime: '14:00' }] };
  let svc: PlanningService;
  let messaging: any;
  let db: any;
  beforeEach(() => {
    db = { user: { findMany: jest.fn().mockResolvedValue([emp]) }, notification: { create: jest.fn().mockResolvedValue({}) }, employeePlanSegment: { findMany: jest.fn().mockResolvedValue([]) }, employeeAbsence: { findMany: jest.fn().mockResolvedValue([]) }, actionLog: { create: jest.fn().mockResolvedValue({}) }, plan: { findFirst: jest.fn().mockResolvedValue({ ...plan, assignedEmployees: [{ employee: emp }] }), update: jest.fn().mockResolvedValue({}) } };
    messaging = { sendShiftPlanNotification: jest.fn().mockResolvedValue({ success: false, error: 'WhatsApp nicht gesendet: maximal 1024' }), sendWhatsAppDirect: jest.fn() };
    svc = new PlanningService(db, {} as any, messaging);
  });
  it('returns provider/guard failures to assignment caller and logs failure, not success', async () => {
    const failures = await (svc as any).notifyAssignedEmployees(plan, [emp], true);
    expect(failures).toEqual(['Max Beispiel: WhatsApp nicht gesendet: maximal 1024']);
    expect(db.actionLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'WHATSAPP_NOTIFICATION_FAILED' }) }));
    expect(db.employeePlanSegment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { planId: 'p', employeeId: { in: ['w'] } } }));
  });
  it('manual general resend exposes a clear HTTP validation error', async () => {
    jest.spyOn(svc, 'findOne').mockResolvedValue(plan as any);
    await expect(svc.resendPlanNotification('p')).rejects.toThrow('maximal 1024');
  });
  it('cancellation retains successful deletion while returning notification warnings', async () => {
    const result = await svc.deactivate('p');
    expect(db.plan.update).toHaveBeenCalled();
    expect(result.notificationWarnings).toEqual(['Max Beispiel: WhatsApp nicht gesendet: maximal 1024']);
    expect(messaging.sendShiftPlanNotification).toHaveBeenCalledWith(expect.objectContaining({ event: 'CANCELLED' }));
    expect(messaging.sendWhatsAppDirect).not.toHaveBeenCalled();
  });
  it('removal uses the supplied prior plan, every location and no response buttons', async () => {
    await (svc as any).notifyRemovedEmployees({ ...plan, locations: [...plan.locations, { warehouseName: 'Süd', hallName: 'B', startTime: '15:00', isOpenEnd: true }], notes: 'PRIVATE' }, ['w']);
    const call = messaging.sendShiftPlanNotification.mock.calls[0][0];
    expect(call.event).toBe('REMOVED');
    expect(call.schedule).toContain('Nord'); expect(call.schedule).toContain('Süd');
    expect(JSON.stringify(call)).not.toContain('PRIVATE');
  });
  it('new employees in an updated plan get new assignment status', async () => {
    await (svc as any).notifyAssignedEmployees({ ...plan, newlyAssignedEmployeeIds: ['w'] }, [emp], true);
    expect(messaging.sendShiftPlanNotification).toHaveBeenCalledWith(expect.objectContaining({ event: 'ASSIGNED' }));
  });
  it('single resend includes all halls and no invented meeting time', async () => {
    db.planEmployee = { findUnique: jest.fn().mockResolvedValue({ employee: emp, plan: { ...plan, locations: [...plan.locations, { warehouseName: 'Süd', hallName: 'B' }] } }) };
    await svc.sendSingleConfirmationWhatsApp('p', 'w');
    const call = messaging.sendShiftPlanNotification.mock.calls[0][0];
    expect(call.schedule).toContain('Süd');
    expect(call.treffpunktInfo).toContain('Nicht angegeben');
    expect(JSON.stringify(call)).not.toMatch(/Duisburg|07:45|Haupttor/);
  });
  it('all-worker resend returns per-worker visible errors', async () => {
    jest.spyOn(svc, 'findOne').mockResolvedValue(plan as any);
    const result = await svc.sendPlanWhatsAppToAll('p');
    expect(result.failedCount).toBe(1);
    expect(result.results[0].error).toContain('maximal 1024');
  });
});

describe('editing a plan preserves the first accepted response', () => {
  it('retains status, private response note, timestamp and channel while changing times and membership', async () => {
    let rows: any[] = [{ planId: 'p', employeeId: 'retained', confirmationStatus: 'SICK', responseNote: 'private response', respondedAt: new Date('2026-11-23T10:00:00Z'), responseChannel: 'WHATSAPP' }, { planId: 'p', employeeId: 'removed', confirmationStatus: 'CONFIRMED' }];
    const original = { ...rows[0] };
    const tx: any = { planEmployee: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(async ({ where }) => { rows = rows.filter(r => where.employeeId.notIn.includes(r.employeeId)); }),
      updateMany: jest.fn(async ({ where, data }) => { rows.filter(r => where.employeeId.in.includes(r.employeeId)).forEach(r => Object.assign(r, data)); }),
      createMany: jest.fn(async ({ data, skipDuplicates }) => { expect(skipDuplicates).toBe(true); for (const row of data) if (!rows.some(r => r.employeeId === row.employeeId)) rows.push({ ...row, confirmationStatus: 'PENDING' }); }),
    } };
    const svc = new PlanningService({} as any, {} as any, {} as any);
    const startTime = new Date('2026-11-24T06:00:00Z'), endTime = new Date('2026-11-24T14:00:00Z');
    await (svc as any).syncPlanEmployees(tx, 'p', ['retained', 'new', 'new'], startTime, endTime);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ ...original, startTime, endTime });
    expect(rows[1]).toMatchObject({ employeeId: 'new', confirmationStatus: 'PENDING' });
    expect(rows.some(r => r.employeeId === 'removed')).toBe(false);
    expect(tx.planEmployee.updateMany.mock.calls[0][0].data).toEqual({ startTime, endTime });
  });
});
