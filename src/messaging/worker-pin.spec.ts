import * as bcrypt from 'bcrypt';
import { MessagingService } from './messaging.service';
import { WorkerPinService } from './worker-pin.service';

// Synthetic only: no network, no real database. The PIN hash is a real bcrypt
// hash of a synthetic PIN; the plaintext never appears in logs or replies.
describe('Worker PIN verification gate', () => {
  const PIN = '482916';
  const now = new Date('2026-11-28T10:00:00Z');
  const second = now.getTime() / 1000;
  const worker = { id: 'worker-1', name: 'Test Worker', phone: '+491701234567' };

  let userRow: any;
  let db: any;
  let pinService: WorkerPinService;

  const text = (body: string, id: string, offset = 0) => ({
    id, from: '491701234567', timestamp: String(second + offset), type: 'text', text: { body },
  });
  const button = (id: string, offset = 0) => ({
    id, from: '491701234567', timestamp: String(second + offset), type: 'interactive',
    interactive: { button_reply: { id: 'CONFIRM_plan-1_worker-1', title: 'Ich bin da' } },
  });

  beforeEach(async () => {
    userRow = {
      whatsappPinHash: await bcrypt.hash(PIN, 4),
      whatsappPinFailedAttempts: 0,
      whatsappPinFailedDay: null,
    };
    db = {
      user: {
        findUnique: jest.fn(() => Promise.resolve(userRow)),
        update: jest.fn(({ data }: any) => { Object.assign(userRow, data); return Promise.resolve(userRow); }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      plan: { findUnique: jest.fn().mockResolvedValue({ date: now, locations: [] }) },
      planEmployee: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      employeeAbsence: { upsert: jest.fn().mockResolvedValue({}) },
      actionLog: { create: jest.fn().mockResolvedValue({}) },
    };
    db.$transaction = jest.fn((cb) => cb(db));
    pinService = new WorkerPinService(db);
  });

  describe('WorkerPinService', () => {
    it('verifies a correct PIN once and keeps the session for 24h', async () => {
      expect(pinService.isVerified('worker-1')).toBe(false);
      await expect(pinService.tryVerify('worker-1', PIN)).resolves.toBe('ok');
      expect(pinService.isVerified('worker-1')).toBe(true);
      expect(userRow.whatsappPinFailedAttempts).toBe(0);
    });

    it('locks after 3 wrong attempts and stays locked even for the correct PIN', async () => {
      await expect(pinService.tryVerify('worker-1', '000000')).resolves.toBe('wrong');
      await expect(pinService.tryVerify('worker-1', '000000')).resolves.toBe('wrong');
      await expect(pinService.tryVerify('worker-1', '000000')).resolves.toBe('locked');
      await expect(pinService.tryVerify('worker-1', PIN)).resolves.toBe('locked');
      expect(pinService.isVerified('worker-1')).toBe(false);
    });

    it('resets the counter on a new UTC day', async () => {
      await pinService.tryVerify('worker-1', '000000');
      expect(userRow.whatsappPinFailedAttempts).toBe(1);
      userRow.whatsappPinFailedDay = '2026-01-01'; // previous UTC day
      await expect(pinService.tryVerify('worker-1', PIN)).resolves.toBe('ok');
    });

    it('reports hasPin only from the stored hash', async () => {
      await expect(pinService.hasPin('worker-1')).resolves.toBe(true);
      userRow.whatsappPinHash = null;
      await expect(pinService.hasPin('worker-1')).resolves.toBe(false);
    });

    it('holds and returns the pending question exactly once', () => {
      pinService.holdText('worker-1', 'Meine Stunden');
      expect(pinService.takeHeldText('worker-1')).toBe('Meine Stunden');
      expect(pinService.takeHeldText('worker-1')).toBeNull();
    });
  });

  describe('webhook gate', () => {
    let service: MessagingService;
    let send: jest.SpyInstance;
    let selfService: any;

    beforeEach(() => {
      selfService = {
        resolveWorkerByExactPhone: jest.fn().mockResolvedValue({ status: 'MATCHED', worker }),
        normalizePhoneNumber: (p: string) => String(p || '').replace(/\D/g, ''),
        replyLanguage: jest.fn().mockReturnValue('de'),
        detectLanguage: jest.fn().mockReturnValue('de'),
        explicitLanguageRequest: jest.fn().mockReturnValue(false),
        parseWorkerMessage: jest.fn().mockReturnValue({ intent: 'HOURS' }),
        handleIncomingConversation: jest.fn().mockResolvedValue({ handled: true, replyText: '42 Stunden' }),
        formatHelpReply: jest.fn().mockReturnValue('help'),
      };
      service = new MessagingService(db, selfService, undefined, undefined, pinService);
      send = jest.spyOn(service, 'sendWhatsAppDirect').mockResolvedValue({ success: true });
      // The menu layer is not under test; keep it silent.
      jest.spyOn(service as any, 'workerMenu').mockReturnValue(undefined);
      jest.spyOn(service, 'sendWorkerMenu').mockResolvedValue({ success: true } as any);
    });

    it('asks for the PIN on the first question and holds the question', async () => {
      await service.processIncomingWebhookMessage(text('Meine Stunden im Oktober', 'q1'), now);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][1]).toContain('6-stellige WhatsApp-PIN');
      expect(selfService.handleIncomingConversation).not.toHaveBeenCalled();
      expect(pinService.isVerified('worker-1')).toBe(false);
    });

    it('answers the held question right after the correct PIN', async () => {
      await service.processIncomingWebhookMessage(text('Meine Stunden im Oktober', 'q1'), now);
      await service.processIncomingWebhookMessage(text(PIN, 'pin1', 1), now);
      const bodies = send.mock.calls.map((c) => c[1]);
      expect(bodies.some((b) => b.includes('Identität ist bestätigt'))).toBe(true);
      expect(selfService.handleIncomingConversation).toHaveBeenCalledWith(
        '491701234567', 'Meine Stunden im Oktober', now, 'de',
      );
      // The PIN value itself is never sent back or logged into replies.
      expect(bodies.some((b) => b.includes(PIN))).toBe(false);
    });

    it('rejects a wrong PIN without consuming anything and locks after 3 tries', async () => {
      await service.processIncomingWebhookMessage(text('000000', 'p1'), now);
      await service.processIncomingWebhookMessage(text('000000', 'p2', 1), now);
      await service.processIncomingWebhookMessage(text('000000', 'p3', 2), now);
      const bodies = send.mock.calls.map((c) => c[1]);
      expect(bodies.filter((b) => b.includes('nicht korrekt'))).toHaveLength(2);
      expect(bodies.some((b) => b.includes('Zu viele falsche PIN-Versuche'))).toBe(true);
      expect(selfService.handleIncomingConversation).not.toHaveBeenCalled();
    });

    it('lets shift buttons through without a PIN', async () => {
      await service.processIncomingWebhookMessage(button('b1'), now);
      // No PIN request was sent; the button path ran (and found no plan rows in the stub).
      const bodies = send.mock.calls.map((c) => c[1]);
      expect(bodies.every((b) => !b.includes('WhatsApp-PIN'))).toBe(true);
      expect(pinService.isVerified('worker-1')).toBe(false);
    });

    it('skips the gate entirely for workers without a PIN', async () => {
      userRow.whatsappPinHash = null;
      await service.processIncomingWebhookMessage(text('Meine Stunden im Oktober', 'q2'), now);
      expect(selfService.handleIncomingConversation).toHaveBeenCalled();
      const bodies = send.mock.calls.map((c) => c[1]);
      expect(bodies.every((b) => !b.includes('WhatsApp-PIN'))).toBe(true);
    });
  });
});
