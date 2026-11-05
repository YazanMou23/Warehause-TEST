import { MessagingService } from './messaging.service';
import { WhatsappSelfServiceService } from './whatsapp-self-service.service';

describe('Worker help fallback', () => {
  const now = new Date('2026-11-05T16:00:00Z');
  let db: any, self: WhatsappSelfServiceService, service: MessagingService, send: jest.SpyInstance;
  beforeEach(() => {
    db = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'worker-1', name: 'Test Worker', phone: '+491701234567', role: 'EMPLOYEE' }]) },
      planEmployee: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      actionLog: { create: jest.fn().mockResolvedValue({}) },
    };
    db.$transaction = jest.fn(cb => cb(db));
    self = new WhatsappSelfServiceService(db, {} as any, { get: jest.fn() } as any);
    service = new MessagingService(db, self);
    send = jest.spyOn(service, 'sendWhatsAppDirect').mockResolvedValue({ success: true });
  });
  const message = (body: string) => ({ id: 'help-test', from: '491701234567', timestamp: String(now.getTime()/1000), type: 'text', text: { body } });
  it.each([
    ['Hallo xyz', 'Oktober 2026'], ['merhaba xyz', 'Ekim 2026'],
    ['مرحبا xyz', 'أكتوبر 2026'], ['Привіт xyz', 'жовтень 2026'],
  ])('sends one localized help for %s and suppresses duplicate webhook', async (body, expected) => {
    await service.processIncomingWebhookMessage(message(body), now);
    await service.processIncomingWebhookMessage(message(body), now);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toContain(expected);
    expect(db.planEmployee.updateMany).not.toHaveBeenCalled();
  });
  it('preserves CUSTOM free-text note instead of returning help', async () => {
    db.planEmployee.findMany.mockResolvedValue([{ planId: 'plan-1', employeeId: 'worker-1', confirmationStatus: 'CUSTOM_RESPONSE', responseNote: 'Wartet auf individuelle Textnachricht' }]);
    await service.processIncomingWebhookMessage(message('مرحبا xyz'), now);
    expect(db.planEmployee.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ responseNote: 'مرحبا xyz' }) }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).not.toContain('أكتوبر 2026');
  });
  it.each([
    ['بالعربي', 'أكتوبر'], ['Auf arabisch?', 'أكتوبر'], ['Türkçe', 'Ekim'], ['українською', 'жовтень'],
  ])('honors explicit language %s and remembers it for neutral session messages', async (body, expected) => {
    await service.processIncomingWebhookMessage(message(body), now);
    expect(send.mock.calls[0][1]).toContain(expected);
    await service.processIncomingWebhookMessage({ ...message('???'), id: 'neutral-next' }, now);
    expect(send.mock.calls[1][1]).toContain(expected);
    expect(db.planEmployee.updateMany).not.toHaveBeenCalled();
  });
  it('keeps language sessions isolated and allows explicit switching', () => {
    expect(self.replyLanguage('one', 'بالعربي')).toBe('ar');
    expect(self.replyLanguage('one', 'ja')).toBe('ar');
    expect(self.replyLanguage('two', 'ja')).toBe('de');
    expect(self.replyLanguage('one', 'Türkçe')).toBe('tr');
    expect(self.replyLanguage('one', 'ja')).toBe('tr');
    expect(self.replyLanguage('stored', 'ja', 'uk')).toBe('uk');
  });
  it('expires session preference and clears it after service restart', () => {
    self.replyLanguage('one', 'بالعربي');
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 24 * 60 * 60 * 1000 + 1);
    expect(self.replyLanguage('one', 'ja')).toBe('de');
    clock.mockRestore();
    const restarted = new WhatsappSelfServiceService(db, {} as any, {} as any);
    expect(restarted.replyLanguage('one', 'ja')).toBe('de');
  });
  it('language commands never consume the pending CUSTOM note', async () => {
    db.planEmployee.findMany.mockResolvedValue([{ planId: 'plan-1', employeeId: 'worker-1', confirmationStatus: 'CUSTOM_RESPONSE', responseNote: 'Wartet auf individuelle Textnachricht' }]);
    await service.processIncomingWebhookMessage(message('بالعربي'), now);
    expect(db.planEmployee.updateMany).not.toHaveBeenCalled();
    await service.processIncomingWebhookMessage({ ...message('أتأخر قليلاً'), id: 'actual-note' }, now);
    expect(db.planEmployee.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ responseNote: 'أتأخر قليلاً' }) }));
    expect(send.mock.calls[1][1]).toContain('تم حفظ رسالتك');
  });
  it('explicit preference overrides question language for read-only replies', async () => {
    self.replyLanguage('worker-1', 'بالعربي');
    const timesheets: any = { getWorkerTimesheetHoursForPeriod: jest.fn().mockResolvedValue({ hasRecords: false, totalHours: null }) };
    const conversation = new WhatsappSelfServiceService(db, timesheets, {} as any);
    conversation.replyLanguage('worker-1', 'بالعربي');
    const result = await conversation.handleIncomingConversation('+491701234567', 'Meine Stunden im Oktober 2026', now);
    expect(result.language).toBe('ar');
    expect(result.replyText).toContain('أكتوبر');
  });

  it.each([
    ['Wie viele Stunden habe ich im Oktober 2026 gearbeitet?', 'HOURS'],
    ['Meine Schichtpläne im Oktober 2026', 'PLANS'],
    ['Ekim 2026 kaç saat çalıştım?', 'HOURS'], ['Vardiyalarım Ekim 2026', 'PLANS'],
    ['شو ساعاتي لشهر Oktober', 'HOURS'],
    ['ساعاتي في أكتوبر 2026', 'HOURS'], ['مناوباتي في أكتوبر 2026', 'PLANS'],
    ['Мої години за жовтень 2026', 'HOURS'], ['Мої зміни жовтень 2026', 'PLANS'],
  ])('help example parses correctly: %s', (body, intent) => {
    expect(self.parseWorkerMessage(body, now, 'Test Worker')).toMatchObject({ intent, year: 2026, month: 10, isDateAmbiguous: undefined });
  });
});
