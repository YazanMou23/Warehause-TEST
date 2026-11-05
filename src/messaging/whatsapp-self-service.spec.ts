import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { TimesheetStatus, Role } from '@prisma/client';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { WhatsappSelfServiceService } from './whatsapp-self-service.service';
import { TimesheetService } from '../timesheet/timesheet.service';

describe('Phase-1 Worker WhatsApp Self-Service', () => {
  const APP_SECRET = 'test_meta_app_secret_2026';
  const REFERENCE_DATE = new Date('2026-10-20T10:00:00.000Z'); // October 2026
  const originalEnv = { ...process.env };

  const workerAli = {
    id: 'emp-ali-1',
    name: 'Ali Yilmaz',
    phone: '+49 170 1234567',
    role: Role.EMPLOYEE,
    isActive: true,
    deletedAt: null,
  };

  const workerHassan = {
    id: 'emp-hassan-2',
    name: 'Hassan Al-Masri',
    phone: '+49 172 9876543',
    role: Role.EMPLOYEE,
    isActive: true,
    deletedAt: null,
  };

  const workerOlena = {
    id: 'emp-olena-3',
    name: 'Olena Kovalenko',
    phone: '+49 160 5554433',
    role: Role.EMPLOYEE,
    isActive: true,
    deletedAt: null,
  };

  let mockPrisma: any;
  let timesheetService: TimesheetService;
  let selfService: WhatsappSelfServiceService;
  let messagingService: MessagingService;
  let messagingController: MessagingController;
  let sendWhatsAppSpy: jest.SpyInstance;

  function signPayload(payload: any, secret = APP_SECRET): { rawBody: Buffer; signature: string } {
    const rawStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const rawBody = Buffer.from(rawStr, 'utf8');
    const hex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return { rawBody, signature: `sha256=${hex}` };
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.WHATSAPP_APP_SECRET = APP_SECRET;
    delete process.env.META_APP_SECRET;

    mockPrisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([workerAli, workerHassan, workerOlena]),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      timesheet: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        create: jest.fn(),
      },
      timesheetEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
      attendance: {
        findMany: jest.fn().mockResolvedValue([
          // Intentionally different attendance total (e.g. 999h) to prove self-service NEVER uses attendance totals
          {
            id: 'att-fake-999',
            employeeId: workerAli.id,
            totalHours: 999,
            date: new Date('2026-10-15T00:00:00.000Z'),
          },
        ]),
        update: jest.fn(),
      },
      plan: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve({ id: where?.id || 'plan-22', date: REFERENCE_DATE, deletedAt: null }),
        ),
        update: jest.fn(),
      },
      planEmployee: {
        findFirst: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve({
            planId: where?.planId || 'plan-22',
            employeeId: where?.employeeId || workerAli.id,
            confirmationStatus: 'PENDING',
            respondedAt: null,
            plan: { id: where?.planId || 'plan-22', date: REFERENCE_DATE, deletedAt: null },
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      employeeAbsence: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      actionLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'WHATSAPP_APP_SECRET') return process.env.WHATSAPP_APP_SECRET;
        if (key === 'META_APP_SECRET') return process.env.META_APP_SECRET;
        return undefined;
      }),
    } as unknown as ConfigService;

    timesheetService = new TimesheetService(mockPrisma, {} as any, {} as any);
    selfService = new WhatsappSelfServiceService(
      mockPrisma,
      timesheetService,
      mockConfigService,
    );
    messagingService = new MessagingService(mockPrisma, selfService);
    messagingController = new MessagingController(messagingService);

    sendWhatsAppSpy = jest
      .spyOn(messagingService, 'sendWhatsAppDirect')
      .mockResolvedValue({ success: true });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ─── 1. Webhook Signature Verification ──────────────────────────────────────

  describe('1. Meta Webhook Signature Verification', () => {
    const sampleWebhookBody = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.sig.test.1',
                    from: '491701234567',
                    timestamp: '1792490400',
                    type: 'text',
                    text: { body: 'Wie viele Stunden habe ich diesen Monat gearbeitet?' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    it('accepts a valid HMAC-SHA256 signature and processes the webhook', async () => {
      const { rawBody, signature } = signPayload(sampleWebhookBody);
      const res = await messagingController.handleWebhook(sampleWebhookBody, signature, {
        rawBody,
        headers: { 'x-hub-signature-256': signature },
      });
      expect(res).toBe('EVENT_RECEIVED');
      expect(sendWhatsAppSpy).toHaveBeenCalledTimes(1);
    });

    it('rejects requests with missing signature header', async () => {
      const { rawBody } = signPayload(sampleWebhookBody);
      await expect(
        messagingController.handleWebhook(sampleWebhookBody, undefined, {
          rawBody,
          headers: {},
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });

    it('rejects requests signed with an invalid/wrong secret', async () => {
      const { rawBody, signature } = signPayload(sampleWebhookBody, 'wrong_secret_key');
      await expect(
        messagingController.handleWebhook(sampleWebhookBody, signature, {
          rawBody,
          headers: { 'x-hub-signature-256': signature },
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });

    it('rejects requests when the payload has been tampered with after signing', async () => {
      const { signature } = signPayload(sampleWebhookBody);
      const tamperedBody = JSON.parse(JSON.stringify(sampleWebhookBody));
      tamperedBody.entry[0].changes[0].value.messages[0].from = '491729876543';
      const tamperedRawBody = Buffer.from(JSON.stringify(tamperedBody), 'utf8');

      await expect(
        messagingController.handleWebhook(tamperedBody, signature, {
          rawBody: tamperedRawBody,
          headers: { 'x-hub-signature-256': signature },
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });

    it('rejects malformed signature headers or missing app secret config', async () => {
      const { rawBody } = signPayload(sampleWebhookBody);
      await expect(
        messagingController.handleWebhook(sampleWebhookBody, 'invalid_format_123', {
          rawBody,
        }),
      ).rejects.toThrow(UnauthorizedException);

      delete process.env.WHATSAPP_APP_SECRET;
      delete process.env.META_APP_SECRET;
      const { signature } = signPayload(sampleWebhookBody, APP_SECRET);
      await expect(
        messagingController.handleWebhook(sampleWebhookBody, signature, { rawBody }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('falls back to META_APP_SECRET when WHATSAPP_APP_SECRET is empty string or whitespace', async () => {
      process.env.WHATSAPP_APP_SECRET = '   ';
      process.env.META_APP_SECRET = 'test_fallback_meta_secret_synthetic_123';

      const { rawBody, signature } = signPayload(
        sampleWebhookBody,
        'test_fallback_meta_secret_synthetic_123',
      );
      const res = await messagingController.handleWebhook(sampleWebhookBody, signature, {
        rawBody,
        headers: { 'x-hub-signature-256': signature },
      });
      expect(res).toBe('EVENT_RECEIVED');
      expect(sendWhatsAppSpy).toHaveBeenCalledTimes(1);

      // Verify that signing with wrong/old secret is rejected
      const wrong = signPayload(sampleWebhookBody, 'wrong_synthetic_secret');
      await expect(
        messagingController.handleWebhook(sampleWebhookBody, wrong.signature, {
          rawBody: wrong.rawBody,
          headers: { 'x-hub-signature-256': wrong.signature },
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('selects higher-priority non-blank candidate when both WHATSAPP_APP_SECRET and META_APP_SECRET are set', async () => {
      process.env.WHATSAPP_APP_SECRET = 'test_priority_whatsapp_secret';
      process.env.META_APP_SECRET = 'test_priority_meta_secret';

      // Primary candidate must be selected
      const primary = signPayload(sampleWebhookBody, 'test_priority_whatsapp_secret');
      const res = await messagingController.handleWebhook(sampleWebhookBody, primary.signature, {
        rawBody: primary.rawBody,
        headers: { 'x-hub-signature-256': primary.signature },
      });
      expect(res).toBe('EVENT_RECEIVED');

      // Secondary candidate must be rejected because primary was selected
      const secondary = signPayload(sampleWebhookBody, 'test_priority_meta_secret');
      await expect(
        messagingController.handleWebhook(sampleWebhookBody, secondary.signature, {
          rawBody: secondary.rawBody,
          headers: { 'x-hub-signature-256': secondary.signature },
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when all candidates are missing or blank/whitespace', async () => {
      process.env.WHATSAPP_APP_SECRET = '   \t  ';
      process.env.META_APP_SECRET = '';

      const { rawBody, signature } = signPayload(sampleWebhookBody, APP_SECRET);
      await expect(
        messagingController.handleWebhook(sampleWebhookBody, signature, {
          rawBody,
          headers: { 'x-hub-signature-256': signature },
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('supports secretOverride with blank fallback and handles standalone messagingService path', async () => {
      // secretOverride takes priority if non-blank
      process.env.WHATSAPP_APP_SECRET = 'test_env_secret';
      const overrideSig = signPayload(sampleWebhookBody, 'test_override_secret');

      const accepted = selfService.verifyWebhookSignature(
        overrideSig.rawBody,
        overrideSig.signature,
        '  test_override_secret  ',
      );
      expect(accepted).toBe(true);

      // If secretOverride is whitespace, falls back to non-blank WHATSAPP_APP_SECRET
      const envSig = signPayload(sampleWebhookBody, 'test_env_secret');
      const fallbackAccepted = selfService.verifyWebhookSignature(
        envSig.rawBody,
        envSig.signature,
        '    ',
      );
      expect(fallbackAccepted).toBe(true);

      // Standalone messagingService without selfService respects non-blank fallback
      const standalone = new MessagingService(mockPrisma);
      process.env.WHATSAPP_APP_SECRET = '   ';
      process.env.META_APP_SECRET = 'standalone_meta_secret';
      const standaloneSig = signPayload(sampleWebhookBody, 'standalone_meta_secret');
      expect(
        standalone.verifyWebhookSignature(standaloneSig.rawBody, standaloneSig.signature),
      ).toBe(true);

      // Standalone messagingService rejects if all blank
      process.env.WHATSAPP_APP_SECRET = ' ';
      process.env.META_APP_SECRET = '';
      expect(() =>
        standalone.verifyWebhookSignature(standaloneSig.rawBody, standaloneSig.signature),
      ).toThrow(UnauthorizedException);
    });

    it('selects correct next candidate when ConfigService returns a blank primary secret', async () => {
      const syntheticMetaSecret = 'synthetic_config_meta_secret_fallback_789';

      const configWithBlankPrimary = {
        get: jest.fn((key: string) => {
          if (key === 'WHATSAPP_APP_SECRET') return '   ';
          if (key === 'META_APP_SECRET') return syntheticMetaSecret;
          return undefined;
        }),
      } as unknown as ConfigService;

      // Ensure process.env does not interfere with ConfigService candidate selection
      delete process.env.WHATSAPP_APP_SECRET;
      delete process.env.META_APP_SECRET;

      const serviceWithConfig = new WhatsappSelfServiceService(
        mockPrisma,
        timesheetService,
        configWithBlankPrimary,
      );

      // Candidate 2 (ConfigService WHATSAPP_APP_SECRET) is whitespace; candidate 3 (ConfigService META_APP_SECRET) is selected
      const valid = signPayload(sampleWebhookBody, syntheticMetaSecret);
      expect(
        serviceWithConfig.verifyWebhookSignature(valid.rawBody, valid.signature),
      ).toBe(true);

      // Request signed with wrong secret is rejected
      const wrong = signPayload(sampleWebhookBody, 'wrong_synthetic_secret');
      expect(() =>
        serviceWithConfig.verifyWebhookSignature(wrong.rawBody, wrong.signature),
      ).toThrow(UnauthorizedException);

      expect(configWithBlankPrimary.get).toHaveBeenCalledWith('WHATSAPP_APP_SECRET');
      expect(configWithBlankPrimary.get).toHaveBeenCalledWith('META_APP_SECRET');
    });

    it('falls through ConfigService blank primary to process.env candidate when ConfigService secondary is also missing/blank', async () => {
      const syntheticEnvSecret = 'synthetic_env_meta_secret_fallback_999';

      const configWithBothBlank = {
        get: jest.fn((key: string) => {
          if (key === 'WHATSAPP_APP_SECRET') return '';
          if (key === 'META_APP_SECRET') return '   ';
          return undefined;
        }),
      } as unknown as ConfigService;

      process.env.WHATSAPP_APP_SECRET = '   ';
      process.env.META_APP_SECRET = syntheticEnvSecret;

      const serviceWithFallback = new WhatsappSelfServiceService(
        mockPrisma,
        timesheetService,
        configWithBothBlank,
      );

      // Candidates 2, 3, 4 are blank; candidate 5 (process.env.META_APP_SECRET) is selected
      const valid = signPayload(sampleWebhookBody, syntheticEnvSecret);
      expect(
        serviceWithFallback.verifyWebhookSignature(valid.rawBody, valid.signature),
      ).toBe(true);
    });
  });

  // ─── 2. Message ID Deduplication ────────────────────────────────────────────

  describe('2. Incoming Message ID Deduplication', () => {
    it('processes each unique message ID once and ignores duplicate deliveries', async () => {
      const msg = {
        id: 'wamid.dedup.001',
        from: '491701234567',
        timestamp: '1792490400',
        type: 'text',
        text: { body: 'Wie viele Stunden habe ich diesen Monat gearbeitet?' },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);
      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);
      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(sendWhatsAppSpy).toHaveBeenCalledTimes(1);

      // A new message with a different ID is processed normally
      const secondMsg = {
        ...msg,
        id: 'wamid.dedup.002',
      };
      await messagingService.processIncomingWebhookMessage(secondMsg, REFERENCE_DATE);
      expect(sendWhatsAppSpy).toHaveBeenCalledTimes(2);
    });

    it('deduplicates repeated button click webhook deliveries with the same message ID', async () => {
      const buttonMsg = {
        id: 'wamid.btn.dedup.001',
        from: '491701234567',
        timestamp: '1792490400',
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: {
            id: `CONFIRM_plan-100_${workerAli.id}`,
            title: 'Ich bin da',
          },
        },
      };

      await messagingService.processIncomingWebhookMessage(buttonMsg, REFERENCE_DATE);
      await messagingService.processIncomingWebhookMessage(buttonMsg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).toHaveBeenCalledTimes(1);
      expect(sendWhatsAppSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 3. Unknown, Lookalike, and Ambiguous Phone Numbers ─────────────────────

  describe('3. Exact Normalized Phone Matching & Lookalike/Ambiguous Rejection', () => {
    beforeEach(() => {
      mockPrisma.timesheet.findMany.mockResolvedValue([
        {
          id: 'ts-ali-oct',
          employeeId: workerAli.id,
          status: TimesheetStatus.CONFIRMED,
          entries: [
            {
              date: new Date('2026-10-15T00:00:00.000Z'),
              weekday: 'Donnerstag',
              startTime: '08:00',
              endTime: '16:30',
              breakMinutes: 30,
              totalHours: 8,
              isActive: true,
            },
          ],
        },
      ]);
    });

    it('matches exact normalized phone numbers in E.164 and national German formats', async () => {
      for (const variant of ['491701234567', '+491701234567', '0049 170 1234567', '0170 1234567']) {
        const res = await selfService.handleIncomingConversation(
          variant,
          'Wie viele Stunden habe ich am 15.10.2026 gearbeitet?',
          REFERENCE_DATE,
        );
        expect(res.status).toBe('OK');
        expect(res.totalHours).toBe(8);
      }
    });

    it('rejects unknown phone numbers and leaks no personal data', async () => {
      const res = await selfService.handleIncomingConversation(
        '+491700000000',
        'Wie viele Stunden habe ich diesen Monat gearbeitet?',
        REFERENCE_DATE,
      );
      expect(res.status).toBe('UNKNOWN_IDENTITY');
      expect(res.handled).toBe(false);
      expect(res.replyText).not.toContain('Ali');
      expect(res.replyText).not.toContain('8');
      expect(mockPrisma.timesheet.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.plan.findMany).not.toHaveBeenCalled();
    });

    it('rejects lookalike numbers sharing the last 8, 9, or 10 digits (never uses suffix/fuzzy matching)', async () => {
      // Worker Ali has +49 170 1234567 (normalized: 491701234567)
      const lookalikes = [
        '1701234567',     // Missing country code & leading 0 (last 10 digits)
        '701234567',      // Last 9 digits
        '01234567',       // Last 8 digits with 0
        '+491711234567',  // Different mobile prefix, identical last 7 digits
        '+431701234567',  // Austrian country code +43, identical last 10 digits
        '+901701234567',  // Turkish country code +90, identical last 10 digits
        '4917012345679',  // Extra trailing digit
      ];

      for (const fakePhone of lookalikes) {
        const res = await selfService.handleIncomingConversation(
          fakePhone,
          'Wie viele Stunden habe ich gearbeitet?',
          REFERENCE_DATE,
        );
        expect(res.status).toBe('UNKNOWN_IDENTITY');
        expect(res.replyText).not.toContain('Ali');
        expect(mockPrisma.timesheet.findMany).not.toHaveBeenCalled();
      }
    });

    it('rejects ambiguous phone numbers when multiple active workers share the same normalized phone', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        workerAli,
        {
          id: 'emp-duplicate-phone',
          name: 'Duplicate Worker',
          phone: '0170-1234567', // normalizes to the same 491701234567 as workerAli
          role: Role.EMPLOYEE,
          isActive: true,
          deletedAt: null,
        },
      ]);

      const res = await selfService.handleIncomingConversation(
        '491701234567',
        'Wie viele Stunden habe ich gearbeitet?',
        REFERENCE_DATE,
      );
      expect(res.status).toBe('AMBIGUOUS_IDENTITY');
      expect(res.handled).toBe(false);
      expect(res.replyText).not.toContain('Ali');
      expect(res.replyText).not.toContain('Duplicate');
      expect(mockPrisma.timesheet.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.plan.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── 4. Cross-Worker Access Attempts & Read-Only Isolation ──────────────────

  describe('4. Cross-Worker Access Prevention & Backend Worker Isolation', () => {
    it('blocks cross-worker access attempts in German, Turkish, Arabic, and Ukrainian', async () => {
      const attempts: Array<{ text: string; lang: 'de' | 'tr' | 'ar' | 'uk' }> = [
        { text: 'Wie viele Stunden hat Hassan diesen Monat gearbeitet?', lang: 'de' },
        { text: 'Zeig mir den Schichtplan von meinem Kollegen', lang: 'de' },
        { text: 'Hassan bu ay kaç saat çalıştı?', lang: 'tr' },
        { text: 'Arkadaşımın vardiya planı ne zaman?', lang: 'tr' },
        { text: 'كم ساعة عمل حسن هذا الشهر؟', lang: 'ar' },
        { text: 'ما هو جدول عمل زميلي؟', lang: 'ar' },
        { text: 'Скільки годин відпрацював іншого працівника?', lang: 'uk' },
        { text: 'Покажи графік роботи мого колеги', lang: 'uk' },
      ];

      for (const item of attempts) {
        const res = await selfService.handleIncomingConversation(
          workerAli.phone,
          item.text,
          REFERENCE_DATE,
        );
        expect(res.status).toBe('CROSS_WORKER_DENIED');
        expect(res.language).toBe(item.lang);
        expect(mockPrisma.timesheet.findMany).not.toHaveBeenCalled();
        expect(mockPrisma.plan.findMany).not.toHaveBeenCalled();
      }
    });

    it('enforces employeeId isolation in backend queries and filters out any foreign worker records', async () => {
      // Even if a faulty DB mock returned another worker's timesheet alongside Ali's,
      // getWorkerTimesheetHoursForPeriod strictly filters by employeeId === workerAli.id
      mockPrisma.timesheet.findMany.mockResolvedValue([
        {
          id: 'ts-ali',
          employeeId: workerAli.id,
          status: TimesheetStatus.CONFIRMED,
          entries: [
            {
              date: new Date('2026-10-12T00:00:00.000Z'),
              weekday: 'Montag',
              startTime: '08:00',
              endTime: '16:30',
              breakMinutes: 30,
              totalHours: 8,
              isActive: true,
            },
          ],
        },
        {
          id: 'ts-hassan-leaked',
          employeeId: workerHassan.id,
          status: TimesheetStatus.CONFIRMED,
          entries: [
            {
              date: new Date('2026-10-12T00:00:00.000Z'),
              weekday: 'Montag',
              startTime: '06:00',
              endTime: '18:00',
              breakMinutes: 0,
              totalHours: 12,
              isActive: true,
            },
          ],
        },
      ]);

      const res = await selfService.handleIncomingConversation(
        workerAli.phone,
        'Wie viele Stunden habe ich diesen Monat gearbeitet?',
        REFERENCE_DATE,
      );

      expect(mockPrisma.timesheet.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: workerAli.id,
            status: TimesheetStatus.CONFIRMED,
          }),
        }),
      );
      expect(res.status).toBe('OK');
      expect(res.totalHours).toBe(8); // Only Ali's 8h, never Hassan's 12h
    });

    it('blocks conversational attempts to edit hours or plans and never writes to records', async () => {
      const editMessages = [
        'Bitte ändere meine Stunden am 15.10.2026 auf 10 Stunden',
        'Saatlerimi 10 saat olarak değiştir',
        'يرجى تعديل ساعاتي إلى 10 ساعات',
        'Зміни мої години на 10 годин',
      ];

      for (const text of editMessages) {
        await messagingService.processIncomingWebhookMessage(
          {
            id: `wamid.edit.${text.slice(0, 6)}`,
            from: '491701234567',
            timestamp: '1792490400',
            type: 'text',
            text: { body: text },
          },
          REFERENCE_DATE,
        );
      }

      expect(mockPrisma.timesheet.update).not.toHaveBeenCalled();
      expect(mockPrisma.timesheetEntry.update).not.toHaveBeenCalled();
      expect(mockPrisma.plan.update).not.toHaveBeenCalled();
      expect(mockPrisma.planEmployee.update).not.toHaveBeenCalled();
      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.attendance.update).not.toHaveBeenCalled();
    });
  });

  // ─── 5. Hours Queries (Default Month, Requested Month, Exact Date, Ambiguous, Missing) ──

  describe('5. Timesheet Hours Calculation & Multilingual Replies (DE, TR, AR, UK)', () => {
    beforeEach(() => {
      mockPrisma.timesheet.findMany.mockImplementation(async () => [
        // October 2026 confirmed timesheet for Ali:
        // - 2026-10-12: 08:00 - 16:30, 30m break => 8.0h
        // - 2026-10-13: 07:45 - 16:00, 30m break => 7.75h
        // - 2026-10-14: 08:00 - 17:00, 45m break => 8.25h
        // - 2026-10-15: inactive blank day => 0h (ignored)
        // Total October = 24.0h across 3 worked days
        {
          id: 'ts-oct-2026',
          employeeId: workerAli.id,
          status: TimesheetStatus.CONFIRMED,
          entries: [
            {
              date: new Date('2026-10-12T00:00:00.000Z'),
              weekday: 'Montag',
              startTime: '08:00',
              endTime: '16:30',
              breakMinutes: 30,
              totalHours: 8,
              isActive: true,
            },
            {
              date: new Date('2026-10-13T00:00:00.000Z'),
              weekday: 'Dienstag',
              startTime: '07:45',
              endTime: '16:00',
              breakMinutes: 30,
              totalHours: 0, // Even if cached totalHours is 0, formula calculates 7.75h from times!
              isActive: true,
            },
            {
              date: new Date('2026-10-14T00:00:00.000Z'),
              weekday: 'Mittwoch',
              startTime: '08:00',
              endTime: '17:00',
              breakMinutes: 45,
              totalHours: 8.25,
              isActive: true,
            },
            {
              date: new Date('2026-10-15T00:00:00.000Z'),
              weekday: 'Donnerstag',
              startTime: '',
              endTime: '',
              breakMinutes: 0,
              totalHours: 0,
              isActive: false,
            },
          ],
        },
        // September 2026 confirmed timesheet for Ali:
        // - 2026-09-10: 08:00 - 14:30, 30m break => 6.0h
        // - 2026-09-11: 08:00 - 16:00, 30m break => 7.5h
        // Total September = 13.5h
        {
          id: 'ts-sep-2026',
          employeeId: workerAli.id,
          status: TimesheetStatus.CONFIRMED,
          entries: [
            {
              date: new Date('2026-09-10T00:00:00.000Z'),
              weekday: 'Donnerstag',
              startTime: '08:00',
              endTime: '14:30',
              breakMinutes: 30,
              totalHours: 6,
              isActive: true,
            },
            {
              date: new Date('2026-09-11T00:00:00.000Z'),
              weekday: 'Freitag',
              startTime: '08:00',
              endTime: '16:00',
              breakMinutes: 30,
              totalHours: 7.5,
              isActive: true,
            },
          ],
        },
        // Unconfirmed PENDING_REVIEW timesheet in October (must be ignored)
        {
          id: 'ts-oct-pending',
          employeeId: workerAli.id,
          status: TimesheetStatus.PENDING_REVIEW,
          entries: [
            {
              date: new Date('2026-10-19T00:00:00.000Z'),
              weekday: 'Montag',
              startTime: '08:00',
              endTime: '18:00',
              breakMinutes: 0,
              totalHours: 10,
              isActive: true,
            },
          ],
        },
      ]);
    });

    it('defaults to the current month when no period is specified and states the period in all 4 languages', async () => {
      // German
      const deRes = await selfService.handleIncomingConversation(
        workerAli.phone,
        'Wie viele Stunden habe ich gearbeitet?',
        REFERENCE_DATE,
      );
      expect(deRes.status).toBe('OK');
      expect(deRes.language).toBe('de');
      expect(deRes.totalHours).toBe(24);
      expect(deRes.replyText).toContain('Oktober 2026');
      expect(deRes.replyText).toContain('24 Std.');
      expect(mockPrisma.attendance.findMany).not.toHaveBeenCalled();

      // Turkish
      const trRes = await selfService.handleIncomingConversation(
        workerAli.phone,
        'Kaç saat çalıştım?',
        REFERENCE_DATE,
      );
      expect(trRes.status).toBe('OK');
      expect(trRes.language).toBe('tr');
      expect(trRes.totalHours).toBe(24);
      expect(trRes.replyText).toContain('Ekim 2026');
      expect(trRes.replyText).toContain('24 saat');

      // Arabic
      const arRes = await selfService.handleIncomingConversation(
        workerAli.phone,
        'كم ساعة عملت؟',
        REFERENCE_DATE,
      );
      expect(arRes.status).toBe('OK');
      expect(arRes.language).toBe('ar');
      expect(arRes.totalHours).toBe(24);
      expect(arRes.replyText).toContain('أكتوبر 2026');
      expect(arRes.replyText).toContain('24 ساعة');

      // Ukrainian
      const ukRes = await selfService.handleIncomingConversation(
        workerAli.phone,
        'Скільки годин я відпрацював?',
        REFERENCE_DATE,
      );
      expect(ukRes.status).toBe('OK');
      expect(ukRes.language).toBe('uk');
      expect(ukRes.totalHours).toBe(24);
      expect(ukRes.replyText).toContain('жовтень 2026');
      expect(ukRes.replyText).toContain('24 год.');
    });

    it('returns requested month hours matching the worker timesheet in all 4 languages', async () => {
      // German: September
      const deRes = await selfService.handleIncomingConversation(
        workerAli.phone,
        'Wie viele Stunden habe ich im September 2026 gearbeitet?',
        REFERENCE_DATE,
      );
      expect(deRes.status).toBe('OK');
      expect(deRes.totalHours).toBe(13.5);
      expect(deRes.replyText).toContain('September 2026');
      expect(deRes.replyText).toContain('13,5 Std.');

      // Turkish: geçen ay (previous month = September 2026)
      const trRes = await selfService.handleIncomingConversation(
        workerAli.phone,
        'Geçen ay kaç saat çalıştım?',
        REFERENCE_DATE,
      );
      expect(trRes.status).toBe('OK');
      expect(trRes.totalHours).toBe(13.5);
      expect(trRes.replyText).toContain('Eylül 2026');
      expect(trRes.replyText).toContain('13.5 saat');

      // Arabic: سبتمبر
      const arRes = await selfService.handleIncomingConversation(
        workerAli.phone,
        'كم ساعة عملت في سبتمبر 2026؟',
        REFERENCE_DATE,
      );
      expect(arRes.status).toBe('OK');
      expect(arRes.totalHours).toBe(13.5);
      expect(arRes.replyText).toContain('سبتمبر 2026');
      expect(arRes.replyText).toContain('13.5 ساعة');

      // Ukrainian: у вересні
      const ukRes = await selfService.handleIncomingConversation(
        workerAli.phone,
        'Скільки годин я відпрацював у вересні 2026?',
        REFERENCE_DATE,
      );
      expect(ukRes.status).toBe('OK');
      expect(ukRes.totalHours).toBe(13.5);
      expect(ukRes.replyText).toContain('вересень 2026');
      expect(ukRes.replyText).toContain('13.5 год.');
    });

    it('returns requested exact date hours matching the timesheet entry calculation', async () => {
      // 13.10.2026 has 07:45 - 16:00 with 30m break => 7.75h
      const res = await selfService.handleIncomingConversation(
        workerAli.phone,
        'Wie viele Stunden habe ich am 13.10.2026 gearbeitet?',
        REFERENCE_DATE,
      );
      expect(res.status).toBe('OK');
      expect(res.totalHours).toBe(7.75);
      expect(res.replyText).toContain('13.10.2026');
      expect(res.replyText).toContain('7,75 Std.');
      expect(res.replyText).toContain('07:45–16:00');
    });

    it('never invents hours or treats missing records as confirmed zero', async () => {
      // Ask for August 2026 (no timesheet records)
      const monthMissing = await selfService.handleIncomingConversation(
        workerAli.phone,
        'Wie viele Stunden habe ich im August 2026 gearbeitet?',
        REFERENCE_DATE,
      );
      expect(monthMissing.status).toBe('NO_RECORDS');
      expect(monthMissing.totalHours).toBeNull();
      expect(monthMissing.replyText).toContain('August 2026');
      expect(monthMissing.replyText).not.toMatch(/\b0(\s|,|\.)*(Std|Stunden|h)\b/i);

      // Ask for 15.10.2026 (inactive blank day on timesheet)
      const dayMissing = await selfService.handleIncomingConversation(
        workerAli.phone,
        'Meine Stunden am 15.10.2026?',
        REFERENCE_DATE,
      );
      expect(dayMissing.status).toBe('NO_RECORDS');
      expect(dayMissing.totalHours).toBeNull();
      expect(dayMissing.replyText).toContain('15.10.2026');
      expect(dayMissing.replyText).not.toMatch(/\b0(\s|,|\.)*(Std|Stunden|h)\b/i);

      // Ask for 19.10.2026 (only PENDING_REVIEW timesheet exists, not CONFIRMED)
      const pendingDay = await selfService.handleIncomingConversation(
        workerAli.phone,
        'Stunden am 19.10.2026?',
        REFERENCE_DATE,
      );
      expect(pendingDay.status).toBe('NO_RECORDS');
      expect(pendingDay.totalHours).toBeNull();
    });

    it('asks for clarification when the requested date is ambiguous', async () => {
      const ambiguousPrompts = [
        'Wie viele Stunden habe ich am 15. gearbeitet?', // Day without month
        'Wie viele Stunden hatte ich am 04/05/2026?',   // Slash DD/MM vs MM/DD ambiguity
        'Meine Stunden am 31.02.2026?',                  // Invalid calendar date
        'Stunden im September oder Oktober?',            // Multiple conflicting months
        'Wie viele Stunden habe ich am Montag gearbeitet?', // Weekday without date
      ];

      for (const prompt of ambiguousPrompts) {
        const res = await selfService.handleIncomingConversation(
          workerAli.phone,
          prompt,
          REFERENCE_DATE,
        );
        expect(res.status).toBe('CLARIFICATION_NEEDED');
        expect(mockPrisma.timesheet.findMany).not.toHaveBeenCalled();
      }
    });
  });

  // ─── 6. Work Plans (Own Upcoming & Historical Plans Only Where Assigned) ───

  describe('6. Work Plans Self-Service (Upcoming & Historical, Assigned Only)', () => {
    beforeEach(() => {
      mockPrisma.plan.findMany.mockImplementation(async () => [
        // Upcoming plan assigned to Ali
        {
          id: 'plan-upcoming-ali',
          date: new Date('2026-10-22T00:00:00.000Z'),
          shift: 'Frühschicht (06:00 - 14:30)',
          treffpunkt: 'Tor 3',
          treffpunktTime: '05:45',
          deletedAt: null,
          locations: [
            {
              warehouse: { name: 'Lager Nord' },
              hall: { name: 'Halle B' },
            },
          ],
          assignedEmployees: [{ employeeId: workerAli.id, confirmationStatus: 'CONFIRMED' }],
          segments: [
            {
              employeeId: workerAli.id,
              startTime: '06:00',
              endTime: '14:30',
              warehouse: { name: 'Lager Nord' },
              hall: { name: 'Halle B' },
            },
          ],
        },
        // Upcoming plan assigned ONLY to Hassan (must NOT be returned to Ali even if mock returns it)
        {
          id: 'plan-upcoming-hassan-only',
          date: new Date('2026-10-23T00:00:00.000Z'),
          shift: 'Spätschicht (14:00 - 22:00)',
          treffpunkt: 'Tor 9',
          treffpunktTime: '13:45',
          deletedAt: null,
          locations: [
            {
              warehouse: { name: 'Geheimlager Süd' },
              hall: { name: 'Halle Z' },
            },
          ],
          assignedEmployees: [{ employeeId: workerHassan.id, confirmationStatus: 'CONFIRMED' }],
          segments: [],
        },
        // Historical plan assigned to Ali (in the past: 2026-10-10)
        {
          id: 'plan-past-ali',
          date: new Date('2026-10-10T00:00:00.000Z'),
          shift: 'Tagschicht (08:00 - 16:30)',
          treffpunkt: 'Haupteingang',
          treffpunktTime: '07:45',
          deletedAt: null,
          locations: [
            {
              warehouse: { name: 'Lager West' },
              hall: { name: 'Halle A' },
            },
          ],
          assignedEmployees: [{ employeeId: workerAli.id, confirmationStatus: 'CONFIRMED' }],
          segments: [],
        },
      ]);
    });

    it('returns only own upcoming plans in German, Turkish, Arabic, and Ukrainian', async () => {
      const queries: Array<{ text: string; lang: 'de' | 'tr' | 'ar' | 'uk' }> = [
        { text: 'Wie sieht mein kommender Schichtplan aus?', lang: 'de' },
        { text: 'Gelecek vardiya planım ne zaman?', lang: 'tr' },
        { text: 'ما هو جدول مناوباتي القادمة؟', lang: 'ar' },
        { text: 'Який мій графік майбутні зміни?', lang: 'uk' },
      ];

      for (const q of queries) {
        const res = await selfService.handleIncomingConversation(
          workerAli.phone,
          q.text,
          REFERENCE_DATE,
        );
        expect(res.status).toBe('OK');
        expect(res.language).toBe(q.lang);
        expect(res.plansCount).toBe(1);
        expect(res.replyText).toContain('22.10.2026');
        expect(res.replyText).toContain('Lager Nord (Halle B)');
        expect(res.replyText).toContain('06:00–14:30');
        expect(res.replyText).toContain('Tor 3');
        // Never leaks Hassan's unassigned plan
        expect(res.replyText).not.toContain('Geheimlager Süd');
        expect(res.replyText).not.toContain('23.10.2026');
        // Never includes past plan in upcoming query
        expect(res.replyText).not.toContain('10.10.2026');
      }
    });

    it('returns only own historical plans when requested', async () => {
      const res = await selfService.handleIncomingConversation(
        workerAli.phone,
        'Welche bisherigen Schichtpläne hatte ich in der Vergangenheit?',
        REFERENCE_DATE,
      );
      expect(res.status).toBe('OK');
      expect(res.plansCount).toBe(1);
      expect(res.replyText).toContain('10.10.2026');
      expect(res.replyText).toContain('Lager West (Halle A)');
      expect(res.replyText).not.toContain('22.10.2026');
      expect(res.replyText).not.toContain('Geheimlager Süd');
    });
  });

  // ─── 7. Regression of Existing CONFIRM / SICK Buttons & Outbound Plan Sending ──

  describe('7. Regression: Existing CONFIRM / SICK Buttons & Outbound Plan Sending', () => {
    it('preserves CONFIRM button behavior unchanged', async () => {
      const confirmButtonMsg = {
        id: 'wamid.btn.confirm.1',
        from: '491701234567',
        timestamp: '1792490400',
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: {
            id: `CONFIRM_plan-22_${workerAli.id}`,
            title: 'Ich bin da',
          },
        },
      };

      await messagingService.processIncomingWebhookMessage(confirmButtonMsg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).toHaveBeenCalledWith({
        where: {
          planId: 'plan-22',
          employeeId: workerAli.id,
          confirmationStatus: { not: 'SICK' },
          OR: [{ respondedAt: null }, { respondedAt: { lt: expect.any(Date) } }],
        },
        data: expect.objectContaining({
          confirmationStatus: 'CONFIRMED',
          responseChannel: 'WHATSAPP_BUTTON',
        }),
      });
      expect(sendWhatsAppSpy).toHaveBeenCalledWith(
        '491701234567',
        expect.stringContaining('Ihre Zusage („Ich bin da“) wurde erfolgreich gespeichert'),
      );
    });

    it('preserves SICK button behavior and EmployeeAbsence sync unchanged', async () => {
      mockPrisma.plan.findUnique.mockResolvedValue({
        id: 'plan-22',
        date: new Date('2026-10-22T00:00:00.000Z'),
      });

      const sickButtonMsg = {
        id: 'wamid.btn.sick.1',
        from: '491701234567',
        timestamp: '1792490400',
        type: 'button',
        button: {
          payload: `SICK_plan-22_${workerAli.id}`,
          text: 'Ich bin krank',
        },
      };

      await messagingService.processIncomingWebhookMessage(sickButtonMsg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).toHaveBeenCalledWith({
        where: {
          planId: 'plan-22',
          employeeId: workerAli.id,
          confirmationStatus: { not: 'SICK' },
          OR: [{ respondedAt: null }, { respondedAt: { lt: expect.any(Date) } }],
        },
        data: expect.objectContaining({
          confirmationStatus: 'SICK',
          responseChannel: 'WHATSAPP_BUTTON',
        }),
      });
      expect(mockPrisma.employeeAbsence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            employeeId_date: {
              employeeId: workerAli.id,
              date: new Date('2026-10-22T00:00:00.000Z'),
            },
          },
          create: expect.objectContaining({ status: 'KRANK' }),
          update: expect.objectContaining({ status: 'KRANK' }),
        }),
      );
      expect(sendWhatsAppSpy).toHaveBeenCalledWith(
        '491701234567',
        expect.stringContaining('Ihre Krankmeldung wurde erfasst'),
      );
    });

    it('preserves outbound interactive & template WhatsApp sending methods', async () => {
      const interactiveRes = await messagingService.sendWhatsAppInteractive(
        workerAli.phone,
        'Ihr Schichtplan für morgen:',
        [
          { id: `CONFIRM_plan-22_${workerAli.id}`, title: 'Ich bin da' },
          { id: `SICK_plan-22_${workerAli.id}`, title: 'Ich bin krank' },
        ],
      );
      expect(interactiveRes).toHaveProperty('waLink');
      expect(interactiveRes.waLink).toContain('491701234567');
    });
  });
});

