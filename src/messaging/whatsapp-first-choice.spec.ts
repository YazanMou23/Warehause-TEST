import { MessagingService } from './messaging.service';

// Stateful storage stub applies the real atomic status/note/timestamp predicates.
// No network or database connection is used.
describe('WhatsApp first accepted choice is final', () => {
  const now = new Date('2026-11-05T16:00:00Z');
  const second = now.getTime() / 1000;
  let rows: any[];
  let db: any;
  let service: MessagingService;
  let send: jest.SpyInstance;
  const button = (action: string, suffix: string, offset = 0) => ({
    id: suffix, from: '491701234567', timestamp: String(second + offset), type: 'interactive',
    interactive: { button_reply: { id: `${action}_plan-1_worker-1`, title: action === 'CONFIRM' ? 'Ich bin da' : action === 'SICK' ? 'Ich bin krank' : 'Custom Nachricht' } },
  });
  const text = (body: string, id: string, offset = 1) => ({ id, from: '491701234567', timestamp: String(second + offset), type: 'text', text: { body } });
  beforeEach(() => {
    rows = [{ planId: 'plan-1', employeeId: 'worker-1', confirmationStatus: 'PENDING', respondedAt: null, responseNote: null }];
    db = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'worker-1', name: 'Test Worker', phone: '+491701234567' }]) },
      plan: { findUnique: jest.fn().mockResolvedValue({ date: now }) },
      planEmployee: {
        findFirst: jest.fn(({ where }: any) => Promise.resolve(rows.find(r => r.planId === where.planId))),
        findMany: jest.fn(({ where }: any) => Promise.resolve(rows.filter(r => r.confirmationStatus === where.confirmationStatus && (!where.responseNote || r.responseNote === where.responseNote)))),
        updateMany: jest.fn(({ where, data }: any) => {
          const r = rows.find(r => r.planId === where.planId && r.employeeId === where.employeeId &&
            r.confirmationStatus === where.confirmationStatus && (!where.responseNote || r.responseNote === where.responseNote) &&
            (!r.respondedAt || r.respondedAt < where.OR[1].respondedAt.lt));
          if (!r) return Promise.resolve({ count: 0 });
          Object.assign(r, data);
          return Promise.resolve({ count: 1 });
        }),
      },
      employeeAbsence: { upsert: jest.fn().mockResolvedValue({}) },
      actionLog: { create: jest.fn().mockResolvedValue({}) },
    };
    db.$transaction = jest.fn(cb => cb(db));
    service = new MessagingService(db);
    send = jest.spyOn(service, 'sendWhatsAppDirect').mockResolvedValue({ success: true });
  });

  it.each(['CONFIRM', 'SICK', 'CUSTOM'])('locks %s against every later button option', async first => {
    await service.processIncomingWebhookMessage(button(first, 'first'), now);
    const saved = { ...rows[0] };
    for (const next of ['CONFIRM', 'SICK', 'CUSTOM']) {
      await service.processIncomingWebhookMessage(button(next, `next-${next}`, 2), now);
      expect(rows[0]).toEqual(saved);
    }
    expect(db.actionLog.create).toHaveBeenCalledTimes(1);
    expect(db.employeeAbsence.upsert).toHaveBeenCalledTimes(first === 'SICK' ? 1 : 0);
    expect(send).toHaveBeenLastCalledWith('491701234567', expect.stringContaining('kann hier nicht geändert werden'));
  });

  it.each(['CONFIRM', 'SICK', 'CUSTOM'])('acknowledges saved %s once with shift, choice and lock details', async choice => {
    await service.processIncomingWebhookMessage(button(choice, 'first'), now);
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][1];
    expect(message).toContain('05.11.2026');
    expect(message).toContain('Plan plan-1');
    expect(message).toContain(choice === 'CONFIRM' ? 'Ich bin da' : choice === 'SICK' ? 'Ich bin krank' : 'Nachricht');
    expect(message).toContain('nicht mehr gültig');
    expect(message).toContain('Schichtleitung');
    expect(message.includes('Bitte schreiben Sie jetzt')).toBe(choice === 'CUSTOM');
    expect(db.planEmployee.updateMany.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]);
  });

  it('keeps acknowledgment honest when descriptive plan lookup fails after commit', async () => {
    db.plan.findUnique.mockRejectedValue(new Error('context read failed'));
    await service.processIncomingWebhookMessage(button('CONFIRM', 'read-fails'), now);
    expect(rows[0].confirmationStatus).toBe('CONFIRMED');
    expect(send).toHaveBeenCalledWith('491701234567', expect.stringContaining('Plan plan-1'));
    expect(send.mock.calls[0][1]).not.toContain('05.11.2026');
  });

  it('concurrent distinct choices commit only one status, audit and acknowledgment', async () => {
    await Promise.all([
      service.processIncomingWebhookMessage(button('CONFIRM', 'concurrent-a'), now),
      service.processIncomingWebhookMessage(button('SICK', 'concurrent-b', 1), now),
    ]);
    expect(db.actionLog.create).toHaveBeenCalledTimes(1);
    expect(rows[0].confirmationStatus).toBe('CONFIRMED');
    expect(db.employeeAbsence.upsert).not.toHaveBeenCalled();
  });

  it('CUSTOM allows exactly one note, including action-looking text, without confirming another plan', async () => {
    await service.processIncomingWebhookMessage(button('CUSTOM', 'custom'), now);
    rows.push({ planId: 'plan-2', employeeId: 'worker-1', confirmationStatus: 'PENDING', respondedAt: null, responseNote: null });
    await service.processIncomingWebhookMessage(text('ja', 'note'), now);
    expect(rows[0].confirmationStatus).toBe('CUSTOM_RESPONSE');
    expect(rows[0].responseNote).toBe('ja');
    expect(rows[1].confirmationStatus).toBe('PENDING');
    await service.processIncomingWebhookMessage(text('changed note', 'second-note', 2), now);
    expect(rows[0].responseNote).toBe('ja');
    expect(db.actionLog.create).toHaveBeenCalledTimes(2);
  });

  it('does not route ambiguous CUSTOM notes into another pending shift', async () => {
    await service.processIncomingWebhookMessage(button('CUSTOM', 'custom'), now);
    rows.push({ ...rows[0], planId: 'plan-other-custom' });
    rows.push({ planId: 'plan-2', employeeId: 'worker-1', confirmationStatus: 'PENDING', respondedAt: null });
    await service.processIncomingWebhookMessage(text('1', 'ambiguous-note'), now);
    expect(rows[2].confirmationStatus).toBe('PENDING');
    expect(db.actionLog.create).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith('491701234567', expect.stringContaining('Mehrere Schichten'));
  });

  it('duplicate/restart delivery cannot unlock a chosen status', async () => {
    const msg = button('CONFIRM', 'dup');
    await service.processIncomingWebhookMessage(msg, now);
    await service.processIncomingWebhookMessage(msg, now);
    const restarted = new MessagingService(db);
    jest.spyOn(restarted, 'sendWhatsAppDirect').mockResolvedValue({ success: true });
    await restarted.processIncomingWebhookMessage(button('SICK', 'after-restart', 2), now);
    expect(rows[0].confirmationStatus).toBe('CONFIRMED');
    expect(db.actionLog.create).toHaveBeenCalledTimes(1);
  });
});
