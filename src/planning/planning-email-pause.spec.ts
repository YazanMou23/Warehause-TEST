/**
 * Tests for the temporary plan-notification EMAIL pause
 * (PLAN_EMAIL_NOTIFICATIONS_PAUSED in planning.service.ts, requested 2026-11-03).
 *
 * While paused: no plan emails (assignment/update/removal/cancellation,
 * including the manual resend endpoint path), but in-app notification records,
 * WhatsApp messages and all other behavior must remain intact.
 */
import { PlanningService } from './planning.service';

describe('PlanningService - temporary plan email pause', () => {
  let service: PlanningService;
  let prisma: any;
  let emailService: any;
  let messagingService: any;

  const plan: any = {
    id: 'plan-1',
    date: new Date('2026-11-10T00:00:00Z'),
    shift: '06:00 - 14:00',
    warehouseName: 'Duisburg',
    hallName: 'GANT',
    assignedEmployees: [
      { id: 'emp-1', name: 'Test Worker', email: 'worker@example.com', phone: '+4915111111111' },
    ],
  };

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([
        { id: 'emp-1', name: 'Test Worker', email: 'worker@example.com', phone: '+4915111111111' },
      ]) },
      notification: { create: jest.fn().mockResolvedValue({}) },
      employeePlanSegment: { findMany: jest.fn().mockResolvedValue([]) },
      employeeAbsence: { findMany: jest.fn().mockResolvedValue([]) },
      actionLog: { create: jest.fn().mockResolvedValue({}) },
    };
    emailService = {
      sendPlanNotification: jest.fn().mockResolvedValue(true),
      sendPlanRemovalNotification: jest.fn().mockResolvedValue(true),
      sendPlanDeletionNotification: jest.fn().mockResolvedValue(true),
    };
    messagingService = {
      sendShiftPlanNotification: jest.fn().mockResolvedValue({ success: true }),
      sendWhatsAppDirect: jest.fn().mockResolvedValue({ success: true }),
    };
    service = new PlanningService(prisma, emailService, messagingService);
  });

  it('assignment notifications: suppresses email, keeps in-app record and WhatsApp', async () => {
    await (service as any).notifyAssignedEmployees(plan, plan.assignedEmployees, false, 'mgr-1');

    expect(emailService.sendPlanNotification).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(messagingService.sendShiftPlanNotification).toHaveBeenCalledTimes(1);
  });

  it('removal notifications: suppresses email, keeps in-app record and WhatsApp', async () => {
    await (service as any).notifyRemovedEmployees(plan, ['emp-1']);

    expect(emailService.sendPlanRemovalNotification).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(messagingService.sendWhatsAppDirect).toHaveBeenCalledTimes(1);
  });

  it('cancellation notifications: suppresses email, keeps in-app record', async () => {
    await (service as any).notifyDeletedPlan(plan);

    expect(emailService.sendPlanDeletionNotification).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('manual resend path (POST /planning/:id/notify) is covered by the same pause', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(plan);
    await service.resendPlanNotification('plan-1', 'mgr-1');

    expect(emailService.sendPlanNotification).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(messagingService.sendShiftPlanNotification).toHaveBeenCalledTimes(1);
  });
});
