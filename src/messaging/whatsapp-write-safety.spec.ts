import { Role } from '@prisma/client';
import { MessagingService } from './messaging.service';
import { WhatsappSelfServiceService } from './whatsapp-self-service.service';
import { TimesheetService } from '../timesheet/timesheet.service';

describe('Phase-2 WhatsApp Reply Write Safety & Concurrency Guards', () => {
  const REFERENCE_DATE = new Date('2026-10-20T10:00:00.000Z');
  const BASE_TIMESTAMP_SEC = Math.floor(REFERENCE_DATE.getTime() / 1000); // 1792490400

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

  let mockPrisma: any;
  let messagingService: MessagingService;
  let selfService: WhatsappSelfServiceService;
  let sendWhatsAppSpy: jest.SpyInstance;

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn((cb) => cb(mockPrisma)),
      user: {
        findMany: jest.fn().mockResolvedValue([workerAli, workerHassan]),
        findFirst: jest.fn(),
      },
      plan: {
        findUnique: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve({ id: where?.id || 'plan-101', date: REFERENCE_DATE, deletedAt: null }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      planEmployee: {
        findFirst: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve({
            planId: where?.planId || 'plan-101',
            employeeId: where?.employeeId || workerAli.id,
            confirmationStatus: 'PENDING',
            respondedAt: null,
            plan: { id: where?.planId || 'plan-101', date: REFERENCE_DATE, deletedAt: null },
          }),
        ),
        findMany: jest.fn().mockResolvedValue([
          {
            planId: 'plan-101',
            employeeId: workerAli.id,
            confirmationStatus: 'PENDING',
            responseNote: null,
            respondedAt: null,
            plan: { id: 'plan-101', date: REFERENCE_DATE, deletedAt: null },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      employeeAbsence: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      actionLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      timesheet: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      timesheetEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      attendance: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const mockConfig = { get: jest.fn() } as any;
    const timesheetService = new TimesheetService(mockPrisma, {} as any, {} as any);
    selfService = new WhatsappSelfServiceService(mockPrisma, timesheetService, mockConfig);
    messagingService = new MessagingService(mockPrisma, selfService);

    sendWhatsAppSpy = jest
      .spyOn(messagingService, 'sendWhatsAppDirect')
      .mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── 1. Timestamp Validation & Clock-Skew Guard ────────────────────────────

  describe('1. Timestamp Validation & Clock-Skew Guard', () => {
    it('rejects message with missing timestamp without modifying DB or sending reply', async () => {
      const msg = {
        id: 'wamid.ts.missing',
        from: '491701234567',
        type: 'text',
        text: { body: '1' },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });

    it('rejects message with non-numeric timestamp string', async () => {
      const msg = {
        id: 'wamid.ts.invalid',
        from: '491701234567',
        timestamp: '1792490abc',
        type: 'text',
        text: { body: '1' },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });

    it('rejects message with millisecond timestamp (13 digits)', async () => {
      const msg = {
        id: 'wamid.ts.ms',
        from: '491701234567',
        timestamp: `${BASE_TIMESTAMP_SEC}000`,
        type: 'text',
        text: { body: '1' },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });

    it('rejects historical timestamp prior to year 2020', async () => {
      const msg = {
        id: 'wamid.ts.old',
        from: '491701234567',
        timestamp: '1500000000', // 2017
        type: 'text',
        text: { body: '1' },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });

    it('rejects future timestamp exceeding the 300s (5-minute) clock skew', async () => {
      const futureSeconds = BASE_TIMESTAMP_SEC + 305; // 305s ahead of reference date
      const msg = {
        id: 'wamid.ts.future',
        from: '491701234567',
        timestamp: String(futureSeconds),
        type: 'text',
        text: { body: '1' },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });

    it('accepts valid integer seconds timestamp within the 300s tolerance', async () => {
      const validSeconds = BASE_TIMESTAMP_SEC + 60; // 60s ahead (within 300s skew)
      const msg = {
        id: 'wamid.ts.valid',
        from: '491701234567',
        timestamp: String(validSeconds),
        type: 'text',
        text: { body: '1' },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).toHaveBeenCalledTimes(1);
      expect(sendWhatsAppSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 2. Sender-to-Assignment Authorization ──────────────────────────────────

  describe('2. Sender-to-Assignment Authorization', () => {
    it('rejects button click when payload employeeId does not match sender phone', async () => {
      const msg = {
        id: 'wamid.auth.spoof',
        from: '491701234567', // Ali's phone
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'interactive',
        interactive: {
          button_reply: {
            id: `CONFIRM_plan-101_${workerHassan.id}`, // Hassan's employeeId
            title: 'Ich bin da',
          },
        },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });

    it('rejects button click when plan assignment does not exist for sender', async () => {
      mockPrisma.planEmployee.findFirst.mockResolvedValue(null);

      const msg = {
        id: 'wamid.auth.noassign',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'interactive',
        interactive: {
          button_reply: {
            id: `CONFIRM_plan-999_${workerAli.id}`,
            title: 'Ich bin da',
          },
        },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });

    it('rejects unknown sender phone (0 matches) with no DB mutation', async () => {
      const msg = {
        id: 'wamid.auth.unknown',
        from: '491500000000', // Unknown phone
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'interactive',
        interactive: {
          button_reply: {
            id: 'CONFIRM_plan-101_emp-unknown',
            title: 'Ich bin da',
          },
        },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });

    it('rejects ambiguous sender phone (>1 active users) with no DB mutation', async () => {
      // Mock two users sharing same phone
      mockPrisma.user.findMany.mockResolvedValue([
        workerAli,
        { ...workerHassan, phone: workerAli.phone },
      ]);

      const msg = {
        id: 'wamid.auth.ambig',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'interactive',
        interactive: {
          button_reply: {
            id: `CONFIRM_plan-101_${workerAli.id}`,
            title: 'Ich bin da',
          },
        },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });
  });

  // ─── 3. Ambiguous Plan Replies ──────────────────────────────────────────────

  describe('3. Ambiguous Plan Replies', () => {
    it('does not write to plan when worker has multiple pending assignments (sends clarification)', async () => {
      mockPrisma.planEmployee.findMany.mockResolvedValue([
        { planId: 'plan-101', employeeId: workerAli.id, confirmationStatus: 'PENDING' },
        { planId: 'plan-102', employeeId: workerAli.id, confirmationStatus: 'PENDING' },
      ]);

      const msg = {
        id: 'wamid.ambig.plans',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'text',
        text: { body: '1' },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).toHaveBeenCalledWith(
        '491701234567',
        expect.stringContaining('mehrere offene Schichten'),
      );
    });

    it('does not write to plan when worker has zero pending assignments (sends no-shift message)', async () => {
      mockPrisma.planEmployee.findMany.mockResolvedValue([]);

      const msg = {
        id: 'wamid.none.plans',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'text',
        text: { body: '1' },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).toHaveBeenCalledWith(
        '491701234567',
        expect.stringContaining('keine offene Schicht zur Bestätigung'),
      );
    });
  });

  // ─── 4. Guarded Atomic Conditional Updates & Ordering ───────────────────────

  describe('4. Guarded Atomic Conditional Updates & Ordering', () => {
    it('accepts reply when respondedAt is null and updates status, absence, actionLog, and acknowledges', async () => {
      const msg = {
        id: 'wamid.order.fresh',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'interactive',
        interactive: {
          button_reply: {
            id: `CONFIRM_plan-101_${workerAli.id}`,
            title: 'Ich bin da',
          },
        },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).toHaveBeenCalledWith({
        where: {
          planId: 'plan-101',
          employeeId: workerAli.id,
          confirmationStatus: { not: 'SICK' },
          OR: [{ respondedAt: null }, { respondedAt: { lt: new Date(BASE_TIMESTAMP_SEC * 1000) } }],
        },
        data: expect.objectContaining({
          confirmationStatus: 'CONFIRMED',
          respondedAt: new Date(BASE_TIMESTAMP_SEC * 1000),
          responseChannel: 'WHATSAPP_BUTTON',
        }),
      });
      expect(mockPrisma.actionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'WHATSAPP_CONFIRMED',
        }),
      });
      expect(sendWhatsAppSpy).toHaveBeenCalledWith(
        '491701234567',
        expect.stringContaining('Ihre Zusage („Ich bin da“) wurde erfolgreich gespeichert'),
      );
    });

    it('rejects stale reply when event timestamp is older than existing respondedAt (count === 0)', async () => {
      // Simulate database atomic condition mismatch: existing respondedAt is newer
      mockPrisma.planEmployee.updateMany.mockResolvedValue({ count: 0 });

      const staleTimestampSec = BASE_TIMESTAMP_SEC - 100;
      const msg = {
        id: 'wamid.order.stale',
        from: '491701234567',
        timestamp: String(staleTimestampSec),
        type: 'interactive',
        interactive: {
          button_reply: {
            id: `SICK_plan-101_${workerAli.id}`,
            title: 'Ich bin krank',
          },
        },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      // Absence sync and actionLog must NOT be called when count === 0
      expect(mockPrisma.employeeAbsence.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.actionLog.create).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });

    it('rejects duplicate reply when event timestamp equals existing respondedAt (count === 0)', async () => {
      // When timestamp is identical, lt: eventDate is false, so updateMany matches 0 rows
      mockPrisma.planEmployee.updateMany.mockResolvedValue({ count: 0 });

      const msg = {
        id: 'wamid.order.equal',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'interactive',
        interactive: {
          button_reply: {
            id: `CONFIRM_plan-101_${workerAli.id}`,
            title: 'Ich bin da',
          },
        },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.actionLog.create).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });
  });

  // ─── 5. Follow-Up Notes Handling ────────────────────────────────────────────

  describe('5. Follow-Up Notes Handling', () => {
    it('saves follow-up note to assignment uniquely awaiting note', async () => {
      mockPrisma.planEmployee.findMany.mockResolvedValue([
        {
          planId: 'plan-101',
          employeeId: workerAli.id,
          confirmationStatus: 'CUSTOM_RESPONSE',
          responseNote: 'Wartet auf individuelle Textnachricht',
          plan: { date: REFERENCE_DATE, deletedAt: null },
        },
      ]);

      const msg = {
        id: 'wamid.note.success',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'text',
        text: { body: 'Ich kann erst ab 10:00 Uhr kommen.' },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).toHaveBeenCalledWith({
        where: {
          planId: 'plan-101',
          employeeId: workerAli.id,
          confirmationStatus: 'CUSTOM_RESPONSE',
          responseNote: 'Wartet auf individuelle Textnachricht',
          OR: [{ respondedAt: null }, { respondedAt: { lt: new Date(BASE_TIMESTAMP_SEC * 1000) } }],
        },
        data: expect.objectContaining({
          confirmationStatus: 'CUSTOM_RESPONSE',
          responseNote: 'Ich kann erst ab 10:00 Uhr kommen.',
          responseChannel: 'WHATSAPP_TEXT',
        }),
      });
      expect(sendWhatsAppSpy).toHaveBeenCalledWith(
        '491701234567',
        expect.stringContaining('Ihre Nachricht wurde gespeichert'),
      );
      expect(sendWhatsAppSpy).toHaveBeenCalledTimes(1);
    });

    it('answers hours question via self-service while awaiting note without consuming note state', async () => {
      mockPrisma.planEmployee.findMany.mockResolvedValue([
        {
          planId: 'plan-101',
          employeeId: workerAli.id,
          confirmationStatus: 'CUSTOM_RESPONSE',
          responseNote: 'Wartet auf individuelle Textnachricht',
          plan: { date: REFERENCE_DATE, deletedAt: null },
        },
      ]);
      mockPrisma.timesheet.findMany.mockResolvedValue([
        {
          id: 'ts-oct-2026',
          employeeId: workerAli.id,
          status: 'CONFIRMED',
          entries: [
            {
              date: new Date('2026-10-15T00:00:00.000Z'),
              weekday: 'Donnerstag',
              startTime: '08:00',
              endTime: '16:00',
              breakMinutes: 0,
              totalHours: 8,
              isActive: true,
            },
          ],
        },
      ]);

      const msg = {
        id: 'wamid.note.hours_query',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'text',
        text: { body: 'Wie viele Stunden habe ich diesen Monat gearbeitet?' },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      // Must NOT update planEmployee or consume note
      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      // Must answer with hours
      expect(sendWhatsAppSpy).toHaveBeenCalledWith(
        '491701234567',
        expect.stringContaining('8 Std.'),
      );
    });

    it('drops note update when waiting state was concurrently consumed (count === 0)', async () => {
      mockPrisma.planEmployee.findMany.mockResolvedValue([
        {
          planId: 'plan-101',
          employeeId: workerAli.id,
          confirmationStatus: 'CUSTOM_RESPONSE',
          responseNote: 'Wartet auf individuelle Textnachricht',
          plan: { date: REFERENCE_DATE, deletedAt: null },
        },
      ]);
      // Simulate race condition where another request consumed or updated the waiting state first
      mockPrisma.planEmployee.updateMany.mockResolvedValue({ count: 0 });

      const msg = {
        id: 'wamid.note.race_consumed',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'text',
        text: { body: 'Ich komme 15 Minuten später.' },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      // Verified atomic condition in updateMany includes responseNote
      expect(mockPrisma.planEmployee.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          planId: 'plan-101',
          employeeId: workerAli.id,
          confirmationStatus: 'CUSTOM_RESPONSE',
          responseNote: 'Wartet auf individuelle Textnachricht',
        }),
        data: expect.objectContaining({
          responseNote: 'Ich komme 15 Minuten später.',
        }),
      });

      // No acknowledgment sent if count === 0
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).toHaveBeenCalledTimes(0);
    });

    it('does not save note and clarifies when worker is not awaiting a note', async () => {
      mockPrisma.planEmployee.findMany.mockResolvedValue([]);

      const msg = {
        id: 'wamid.note.noawait',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'text',
        text: { body: 'Hallo wie geht es Ihnen?' },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).toHaveBeenCalledWith(
        '491701234567',
        expect.stringContaining('Wenn Sie eine Schicht bestätigen oder sich krankmelden möchten'),
      );
    });
  });

  // ─── 6. Failure Recovery & In-Memory Dedup Release ───────────────────────────

  describe('6. Failure Recovery & In-Memory Dedup Release', () => {
    it('releases in-memory dedup claim when pre-transaction lookup fails and allows retry', async () => {
      mockPrisma.user.findMany.mockRejectedValueOnce(new Error('Pre-transaction lookup connection reset'));

      const msg = {
        id: 'wamid.pre.fail',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'interactive',
        interactive: {
          button_reply: {
            id: `CONFIRM_plan-101_${workerAli.id}`,
            title: 'Ich bin da',
          },
        },
      };

      // Error must propagate out
      await expect(
        messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE),
      ).rejects.toThrow('Pre-transaction lookup connection reset');

      // Outbound acknowledgment and DB mutations must NOT have occurred
      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();

      // Retry with the exact same msg.id after lookup recovers: must NOT be dropped as duplicate
      mockPrisma.user.findMany.mockResolvedValue([workerAli, workerHassan]);
      mockPrisma.planEmployee.updateMany.mockResolvedValue({ count: 1 });

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);
      expect(mockPrisma.planEmployee.updateMany).toHaveBeenCalledTimes(1);
      expect(sendWhatsAppSpy).toHaveBeenCalledTimes(1);
    });

    it('releases in-memory dedup claim when DB transaction fails and propagates error', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('PostgreSQL connection timeout'));

      const msg = {
        id: 'wamid.tx.fail',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'interactive',
        interactive: {
          button_reply: {
            id: `CONFIRM_plan-101_${workerAli.id}`,
            title: 'Ich bin da',
          },
        },
      };

      // Error must propagate out
      await expect(
        messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE),
      ).rejects.toThrow('PostgreSQL connection timeout');

      // Outbound acknowledgment must NOT be sent
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();

      // Now verify dedup was released: subsequent attempt with SAME message ID is NOT dropped as duplicate!
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));
      mockPrisma.planEmployee.updateMany.mockResolvedValue({ count: 1 });

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);
      expect(sendWhatsAppSpy).toHaveBeenCalledTimes(1);
    });

    it('aborts transaction and releases claim when absence upsert fails', async () => {
      mockPrisma.employeeAbsence.upsert.mockRejectedValue(new Error('Foreign key violation'));

      const msg = {
        id: 'wamid.absence.fail',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'interactive',
        interactive: {
          button_reply: {
            id: `SICK_plan-101_${workerAli.id}`,
            title: 'Ich bin krank',
          },
        },
      };

      await expect(
        messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE),
      ).rejects.toThrow('Foreign key violation');

      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });

    it('preserves dedup claim after successful commit even if subsequent call arrives with same message ID', async () => {
      const msg = {
        id: 'wamid.commit.dedup',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'interactive',
        interactive: {
          button_reply: {
            id: `CONFIRM_plan-101_${workerAli.id}`,
            title: 'Ich bin da',
          },
        },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);
      expect(mockPrisma.planEmployee.updateMany).toHaveBeenCalledTimes(1);
      expect(sendWhatsAppSpy).toHaveBeenCalledTimes(1);

      // Clear call history and resend the exact same message
      jest.clearAllMocks();
      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      // Because it was already committed, dedup remains claimed, so duplicate delivery is ignored
      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });
  });

  // ─── 7. Button Action Allowlist & Unknown Payloads ──────────────────────────

  describe('7. Button Action Allowlist & Unknown Payloads', () => {
    it('rejects unknown button IDs containing 1/2/3 and negative/conflicting titles with valid pending assignment mocked', async () => {
      // Mock a valid pending assignment for worker Ali: if action recognition incorrectly matches
      // via substring or fallback, it would attempt to update this assignment.
      mockPrisma.planEmployee.findFirst.mockResolvedValue({
        planId: 'plan-101',
        employeeId: workerAli.id,
        confirmationStatus: 'PENDING',
        respondedAt: null,
        plan: { id: 'plan-101', date: REFERENCE_DATE, deletedAt: null },
      });
      mockPrisma.planEmployee.findMany.mockResolvedValue([
        {
          planId: 'plan-101',
          employeeId: workerAli.id,
          confirmationStatus: 'PENDING',
          responseNote: null,
          respondedAt: null,
          plan: { id: 'plan-101', date: REFERENCE_DATE, deletedAt: null },
        },
      ]);

      const warnSpy = jest.spyOn((messagingService as any).logger, 'warn');

      const testCases = [
        // 1. Unknown ID containing '1' and negative title ("Ich bin nicht da")
        {
          id: 'UNKNOWN_1_ACTION',
          title: 'Ich bin nicht da',
        },
        // 2. Unknown ID containing plan-101 and employeeId, but unknown action token prefix
        {
          id: `UNKNOWN_ACTION_plan-101_${workerAli.id}`,
          title: 'Unbekannte Aktion',
        },
        // 3. Opaque option containing '2' with negative title ("Nein, nicht da")
        {
          id: 'OPTION_2_SPECIAL',
          title: 'Nein, nicht da',
        },
        // 4. Custom button containing '3' with inverted title ("Ich bin da nicht")
        {
          id: 'BTN_3_CUSTOM_UNKNOWN',
          title: 'Ich bin da nicht',
        },
        // 5. Conflicting ID (CONFIRM) and conflicting title (SICK label)
        {
          id: `CONFIRM_plan-101_${workerAli.id}`,
          title: 'Ich bin krank',
        },
        // 6. Conflicting ID (SICK) and conflicting title (CONFIRM label)
        {
          id: `SICK_plan-101_${workerAli.id}`,
          title: 'Ich bin da',
        },
      ];

      for (const tc of testCases) {
        jest.clearAllMocks();
        const msg = {
          id: `wamid.unknown.${Math.random().toString(36).slice(2)}`,
          from: '491701234567',
          timestamp: String(BASE_TIMESTAMP_SEC),
          type: 'interactive',
          interactive: {
            button_reply: {
              id: tc.id,
              title: tc.title,
            },
          },
        };

        await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

        // Assert zero confirmation writes, zero absence upserts, zero sends
        expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
        expect(mockPrisma.employeeAbsence.upsert).not.toHaveBeenCalled();
        expect(sendWhatsAppSpy).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Unknown button action ID'),
        );
      }
    });

    it('rejects arbitrary template button text with zero database writes', async () => {
      const msg = {
        id: 'wamid.btn.arbitrary',
        from: '491701234567',
        timestamp: String(BASE_TIMESTAMP_SEC),
        type: 'button',
        button: {
          text: 'Foo Bar Random Text',
          payload: 'FOO_BAR',
        },
      };

      await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

      expect(mockPrisma.planEmployee.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.employeeAbsence.upsert).not.toHaveBeenCalled();
      expect(sendWhatsAppSpy).not.toHaveBeenCalled();
    });

    it('accepts valid multilingual button replies (DE, TR, AR, UK) and documented action tokens', async () => {
      mockPrisma.planEmployee.updateMany.mockResolvedValue({ count: 1 });

      const validCases = [
        // DE: CONFIRM action prefix
        {
          id: `CONFIRM_plan-101_${workerAli.id}`,
          title: '✅ Ich bin da',
          expectedStatus: 'CONFIRMED',
        },
        // DE: SICK action prefix
        {
          id: `SICK_plan-101_${workerAli.id}`,
          title: '🤒 Ich bin krank',
          expectedStatus: 'SICK',
        },
        // DE: CUSTOM action prefix
        {
          id: `CUSTOM_plan-101_${workerAli.id}`,
          title: '💬 Custom Nachricht',
          expectedStatus: 'CUSTOM_RESPONSE',
        },
        // TR: Turkish title without ID prefix (legacy button)
        {
          id: 'legacy_btn',
          title: 'Evet',
          expectedStatus: 'CONFIRMED',
        },
        // AR: Arabic title without ID prefix (legacy button)
        {
          id: 'legacy_btn',
          title: 'مريض',
          expectedStatus: 'SICK',
        },
        // UK: Ukrainian title without ID prefix (legacy button)
        {
          id: 'legacy_btn',
          title: 'Повідомлення',
          expectedStatus: 'CUSTOM_RESPONSE',
        },
      ];

      for (const vc of validCases) {
        jest.clearAllMocks();
        const msg = {
          id: `wamid.valid.${Math.random().toString(36).slice(2)}`,
          from: '491701234567',
          timestamp: String(BASE_TIMESTAMP_SEC),
          type: 'interactive',
          interactive: {
            button_reply: {
              id: vc.id,
              title: vc.title,
            },
          },
        };

        await messagingService.processIncomingWebhookMessage(msg, REFERENCE_DATE);

        expect(mockPrisma.planEmployee.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              confirmationStatus: vc.expectedStatus,
            }),
          }),
        );
        expect(sendWhatsAppSpy).toHaveBeenCalledTimes(1);
      }
    });
  });
});

