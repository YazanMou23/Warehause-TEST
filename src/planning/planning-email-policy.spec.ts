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
    expect(messaging.sendWhatsAppDirect).toHaveBeenCalledTimes(1);
  });
  it('suppresses cancellation email and retains WhatsApp and in-app notice', async () => {
    await (service as any).notifyDeletedPlan(plan);
    expect(email.sendPlanDeletionNotification).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(messaging.sendWhatsAppDirect).toHaveBeenCalledTimes(1);
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
