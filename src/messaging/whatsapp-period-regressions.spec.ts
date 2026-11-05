import { WhatsappSelfServiceService } from './whatsapp-self-service.service';
import { MessagingService } from './messaging.service';

describe('explicit worker periods: live-test regressions (mock storage only)', () => {
  const now = new Date('2026-11-05T19:30:00Z');
  const worker = { id: 'synthetic-worker', name: 'Test Worker', phone: '+491701234567', role: 'EMPLOYEE' };
  let db: any, self: WhatsappSelfServiceService;
  beforeEach(() => {
    db = { user: { findMany: jest.fn().mockResolvedValue([worker]) }, plan: { findMany: jest.fn().mockResolvedValue([]) } };
    self = new WhatsappSelfServiceService(db, {} as any, { get: jest.fn() } as any);
  });
  it.each(['١٠ من سنة ٢٠٢٦', '۱۰ من سنة ۲۰۲۶', '10 من سنة 2026'])('reads Arabic prose month %s as October, not current month', value => {
    expect(self.parseWorkerMessage(`ايوا اوك يعني مافي عدد ساعات لشهر ${value}`, now)).toMatchObject({ intent: 'HOURS', periodType: 'MONTH', year: 2026, month: 10, isDateAmbiguous: undefined });
  });
  it.each(['ساعاتي لشهر 10', 'ساعاتي لشهر 13 من سنة 2026', 'ساعاتي لشهر 10 من سنة 2026 و2025'])('clarifies instead of silently defaulting: %s', text => {
    expect(self.parseWorkerMessage(text, now).isDateAmbiguous).toBe(true);
  });
  it.each(['مناوباتي في كامل سنة 2026', 'Meine Schichtpläne im Jahr 2026', 'Vardiyalarım 2026 yılı', 'Мої зміни за 2026 рік'])('reads whole year: %s', text => {
    expect(self.parseWorkerMessage(text, now)).toMatchObject({ intent: 'PLANS', periodType: 'YEAR', year: 2026 });
  });
  it.each(['طيب فيك تعطيني سجل خطط العمل تبعي كاملة لكل الأشهر؟', 'اريد سجل مناوباتي بشكل كامل لجميع الأشهر', 'Meine Schichtpläne für alle Monate'])('reads all months: %s', text => {
    expect(self.parseWorkerMessage(text, now)).toMatchObject({ intent: 'PLANS', periodType: 'ALL' });
  });
  it('scopes the year query to the verified worker and calendar year, not today', async () => {
    await self.handleIncomingConversation(worker.phone, 'مناوباتي في كامل سنة 2026', now);
    expect(db.plan.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      deletedAt: null, assignedEmployees: { some: { employeeId: worker.id } },
      date: { gte: new Date('2026-01-01T00:00:00Z'), lt: new Date('2027-01-01T00:00:00Z') },
    } }));
  });
  it('all months removes only the date filter, never worker/deletion scoping', async () => {
    const reply = await self.handleIncomingConversation(worker.phone, 'اريد سجل مناوباتي بشكل كامل لجميع الأشهر', now);
    expect(db.plan.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null, date: undefined, assignedEmployees: { some: { employeeId: worker.id } } } }));
    expect(reply.replyText).toContain('جميع الأشهر');
    expect(reply.replyText).not.toContain('قادمة');
  });
  it('warns about truncation rather than claiming a complete record', async () => {
    db.plan.findMany.mockResolvedValue(Array.from({ length: 15 }, (_, i) => ({ id: `synthetic-${i}`, date: now, shift: '06:00-14:00', locations: [], employeeSegments: [] })));
    const reply = await self.handleIncomingConversation(worker.phone, 'مناوباتي في كامل سنة 2026', now);
    expect(reply.replyText).toContain('10 مناوبات');
    expect(reply.replyText).toContain('التالي');
    expect(reply.replyText).not.toContain('synthetic-');
  });
  it('routes the live Arabic month question deterministically, without AI or writes', async () => {
    const ai = { isAllowedSender: jest.fn().mockReturnValue(true), classify: jest.fn() };
    const svc = new MessagingService(db, self, ai as any);
    const send = jest.spyOn(svc, 'sendWhatsAppDirect').mockResolvedValue({ success: true });
    const handle = jest.spyOn(self, 'handleIncomingConversation').mockResolvedValue({ handled: true, status: 'NO_RECORDS', language: 'ar', replyText: 'October synthetic' });
    await svc.processIncomingWebhookMessage({ id: 'synthetic-period', from: '491701234567', timestamp: String(now.getTime() / 1000), type: 'text', text: { body: 'ساعاتي لشهر ١٠ من سنة ٢٠٢٦' } }, now);
    expect(handle).toHaveBeenCalled(); expect(send).toHaveBeenCalled(); expect(ai.classify).not.toHaveBeenCalled();
  });
});
