import { MessagingService } from './messaging.service';
import { WhatsappSelfServiceService } from './whatsapp-self-service.service';

// All storage and outbound messaging are mocked. Never calls production services.
describe('WhatsApp accuracy regressions', () => {
  const now = new Date('2026-11-05T13:00:00Z');
  const worker = { id: 'worker-1', name: 'Test Worker', phone: '+491701234567', role: 'EMPLOYEE' };
  let db: any;
  let self: WhatsappSelfServiceService;
  let service: MessagingService;
  let send: jest.SpyInstance;
  beforeEach(() => {
    db = {
      user: { findMany: jest.fn().mockResolvedValue([worker]) },
      plan: { findMany: jest.fn().mockResolvedValue([]) },
      planEmployee: {
        findMany: jest.fn().mockResolvedValue([{ planId: 'unrelated-plan', employeeId: worker.id }]),
        findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve({ planId: where.planId, employeeId: worker.id, plan: { deletedAt: null } })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      actionLog: { create: jest.fn().mockResolvedValue({}) },
    };
    db.$transaction = jest.fn((cb) => cb(db));
    self = new WhatsappSelfServiceService(db, {} as any, { get: jest.fn() } as any);
    service = new MessagingService(db, self);
    send = jest.spyOn(service, 'sendWhatsAppDirect').mockResolvedValue({ success: true });
  });

  it.each(['CONFIRM_missing-worker', 'CONFIRM__worker-1', 'UNKNOWN_plan_worker-1', 'CONFIRM_plan_'])
  ('never falls back from malformed/unknown structured payload %s to another pending shift', async (id) => {
    await service.processIncomingWebhookMessage({
      id: `test-${id}`, from: '491701234567', timestamp: String(now.getTime() / 1000),
      type: 'interactive', interactive: { button_reply: { id, title: 'Ich bin da' } },
    }, now);
    expect(db.planEmployee.updateMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps documented opaque legacy button routing compatible', async () => {
    await service.processIncomingWebhookMessage({
      id: 'legacy', from: '491701234567', timestamp: String(now.getTime() / 1000),
      type: 'interactive', interactive: { button_reply: { id: 'legacy_btn', title: 'Evet' } },
    }, now);
    expect(db.planEmployee.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ planId: 'unrelated-plan', employeeId: worker.id }),
      data: expect.objectContaining({ confirmationStatus: 'CONFIRMED' }),
    }));
  });

  it.each(['nein', 'لا', 'ні', 'hayır', 'hayir'])('clarifies plain refusal %s without status or absence writes', async (text) => {
    db.employeeAbsence = { upsert: jest.fn() };
    await service.processIncomingWebhookMessage({
      id: `no-${text}`, from: '491701234567', timestamp: String(now.getTime() / 1000),
      type: 'text', text: { body: text },
    }, now);
    expect(db.planEmployee.updateMany).not.toHaveBeenCalled();
    expect(db.employeeAbsence.upsert).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not infer sickness from a legacy decline button title', async () => {
    await service.processIncomingWebhookMessage({
      id: 'legacy-no', from: '491701234567', timestamp: String(now.getTime() / 1000),
      type: 'button', button: { payload: 'decline', text: 'Nein' },
    }, now);
    expect(db.planEmployee.updateMany).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(['CONFIRM', 'CUSTOM', 'SICK'])('atomically blocks %s after sickness without touching absence data', async (action) => {
    db.planEmployee.findFirst.mockResolvedValue({ planId: 'plan-1', employeeId: worker.id, confirmationStatus: 'SICK' });
    db.planEmployee.updateMany.mockImplementation(({ where }: any) => Promise.resolve({ count: where.confirmationStatus === 'PENDING' ? 0 : 1 }));
    const title = action === 'CONFIRM' ? 'Ich bin da' : action === 'SICK' ? 'Ich bin krank' : 'Custom Nachricht';
    await service.processIncomingWebhookMessage({
      id: `locked-${action}`, from: '491701234567', timestamp: String(now.getTime() / 1000),
      type: 'interactive', interactive: { button_reply: { id: `${action}_plan-1_worker-1`, title } },
    }, now);
    expect(db.planEmployee.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ confirmationStatus: 'PENDING' }),
    }));
    expect(db.actionLog.create).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('491701234567', expect.stringContaining('kann hier nicht geändert werden'));
  });

  it.each([
    ['Meine Schichten im Dezember 2026', 2026, 12],
    ['Meine Schichten diesen Monat', 2026, 11],
    ['Vardiyalarım Aralık 2026', 2026, 12],
    ['مناوباتي في ديسمبر 2026', 2026, 12],
    ['Мої зміни грудень 2026', 2026, 12],
  ])('queries only the requested calendar month: %s', async (text, year, month) => {
    await self.handleIncomingConversation(worker.phone, text as string, now);
    expect(db.plan.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ date: {
        gte: new Date(Date.UTC(year as number, (month as number) - 1, 1)),
        lte: new Date(Date.UTC(year as number, month as number, 0, 23, 59, 59, 999)),
      } }),
    }));
  });

  it('filters neighboring-month results while preserving only this worker assignment', async () => {
    db.plan.findMany.mockResolvedValue([
      { id: 'nov', date: new Date('2026-11-29Z'), assignedEmployees: [{ employeeId: worker.id }] },
      { id: 'dec', date: new Date('2026-12-04Z'), assignedEmployees: [{ employeeId: worker.id }] },
      { id: 'jan', date: new Date('2027-01-04Z'), assignedEmployees: [{ employeeId: worker.id }] },
      { id: 'other', date: new Date('2026-12-05Z'), assignedEmployees: [{ employeeId: 'other' }] },
    ]);
    const result = await self.handleIncomingConversation(worker.phone, 'Meine Schichten im Dezember 2026', now);
    expect(result.plansCount).toBe(1);
    expect(result.replyText).toContain('Dezember 2026');
    expect(result.replyText).toContain('04.12.2026');
    expect(result.replyText).not.toContain('29.11.2026');
    expect(result.replyText).not.toContain('04.01.2027');
    expect(result.replyText).not.toContain('05.12.2026');
  });

  it.each([
    'Meine Stunden am 2026-11-04 und 05.11.2026',
    'Meine Stunden am 14/11/2026 und 15/11/2026',
  ])('asks rather than silently choosing one of multiple dates: %s', async (text) => {
    const parsed = self.parseWorkerMessage(text, now, worker.name);
    expect(parsed.isDateAmbiguous).toBe(true);
    expect(parsed.ambiguityReason).toBe('MULTIPLE_DATES');
  });
});
