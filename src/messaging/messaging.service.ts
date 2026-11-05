import { Injectable, Logger, OnModuleInit, Optional, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappSelfServiceService } from './whatsapp-self-service.service';

@Injectable()
export class MessagingService implements OnModuleInit {
  private readonly logger = new Logger(MessagingService.name);

  private readonly processedMessageIds = new Map<string, number>();
  private static readonly MESSAGE_DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
  private static readonly MESSAGE_DEDUP_MAX_SIZE = 10000;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly selfService?: WhatsappSelfServiceService,
  ) {}

  async onModuleInit() {
    this.syncWabaWebhookSubscription().catch((err) => {
      this.logger.warn(`Initial WABA webhook subscription sync failed: ${err.message}`);
    });
  }

  formatPhoneNumber(phone: string): string {
    const trimmed = (phone || '').trim();
    let digits = trimmed.replace(/\D/g, '');

    if (trimmed.startsWith('+')) {
      return digits;
    }
    if (digits.startsWith('00')) {
      return digits.substring(2);
    }
    if (digits.startsWith('0')) {
      return '49' + digits.substring(1);
    }
    if (!digits.startsWith('49') && digits.length <= 11) {
      return '49' + digits;
    }
    return digits;
  }

  generateWhatsAppLink(phone: string, message: string): string {
    const cleanedPhone = this.formatPhoneNumber(phone);
    return `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`;
  }

  async sendWhatsAppDirect(phone: string, message: string): Promise<{ success: boolean; data?: any; error?: string; waLink?: string }> {
    const cleanedPhone = this.formatPhoneNumber(phone);
    const waLink = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`;

    // 1. Check Meta WhatsApp Cloud API credentials
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    // 2. Check UltraMsg credentials as fallback provider
    const ultraInstance = process.env.ULTRAMSG_INSTANCE_ID;
    const ultraToken = process.env.ULTRAMSG_TOKEN;

    // Bug#5: API version configurable via env, defaulting to v22.0
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v22.0';

    let metaError: string | null = null;

    if (phoneNumberId && accessToken) {
      const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanedPhone,
            type: 'text',
            text: { body: message },
          }),
        });

        const resData = await response.json();

        if (response.ok) {
          this.logger.log(`WhatsApp message successfully sent via Meta API to +${cleanedPhone}`);
          return { success: true, data: resData, waLink };
        } else {
          metaError = resData.error?.message || 'Meta API rejected request (e.g. number not verified in test mode)';
          this.logger.warn(`Meta WhatsApp API failed for +${cleanedPhone}: ${metaError}. Falling back...`);
        }
      } catch (err: any) {
        metaError = err.message;
        this.logger.error(`Error sending via Meta WhatsApp API: ${err.message}`);
      }
    }

    if (ultraInstance && ultraToken) {
      try {
        const response = await fetch(`https://api.ultramsg.com/${ultraInstance}/messages/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            token: ultraToken,
            to: '+' + cleanedPhone,
            body: message,
          }),
        });

        const resData = await response.json();
        if (response.ok && resData.sent) {
          this.logger.log(`WhatsApp message successfully sent via UltraMsg to +${cleanedPhone}`);
          return { success: true, data: resData, waLink };
        } else {
          this.logger.error(`UltraMsg API error: ${JSON.stringify(resData)}`);
        }
      } catch (err: any) {
        this.logger.error(`UltraMsg error: ${err.message}`);
      }
    }

    // Bug#1 FIX: No provider delivered the message — return success: false.
    // A wa.me fallback link is still provided so the caller can open it manually.
    const errorMsg = metaError
      ? `Meta API: ${metaError}. No fallback provider configured.`
      : 'No WhatsApp API credentials configured. Use the wa.me link to send manually.';

    this.logger.warn(`WhatsApp delivery failed for +${cleanedPhone}. Fallback link: ${waLink}`);
    return {
      success: false,
      error: errorMsg,
      waLink,
    };
  }

  /**
   * Bug#7 FIX: SMS delivery is not yet implemented.
   * Returns a structured response instead of silently returning true,
   * so callers are aware no message was actually delivered.
   */
  async sendSMS(phone: string, message: string): Promise<{ success: boolean; error: string }> {
    this.logger.warn(`[SMS] Not implemented. Would send to ${phone}: "${message}"`);
    return {
      success: false,
      error: 'SMS delivery is not yet implemented. Please configure an SMS provider.',
    };
  }

  /**
   * Send a WhatsApp message to multiple phone numbers.
   * Calls sendWhatsAppDirect sequentially for each number and returns
   * an aggregated results array with per-number success/error/waLink.
   */
  /**
   * Bug#4 FIX: Sends WhatsApp messages in parallel with a concurrency cap of 5
   * to avoid overwhelming the Meta API and reduce total send time.
   */
  async sendWhatsAppBulk(
    phones: string[],
    message: string,
    concurrency = 5,
  ): Promise<{ success: boolean; results: Array<{ phone: string; success: boolean; waLink?: string; error?: string; data?: any }> }> {
    const results: Array<{ phone: string; success: boolean; waLink?: string; error?: string; data?: any }> = [];

    // Process in batches of `concurrency` to avoid rate-limit spikes
    for (let i = 0; i < phones.length; i += concurrency) {
      const batch = phones.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((phone) => this.sendWhatsAppDirect(phone, message).then((res) => ({ phone, ...res }))),
      );
      results.push(...batchResults);
    }

    return {
      success: results.every((r) => r.success),
      results,
    };
  }

  async broadcastMessage(type: 'sms' | 'whatsapp', userIds: string[], message: string): Promise<{ success: boolean; links?: string[]; results?: any }> {
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        isActive: true,
      },
    });

    if (type === 'sms') {
      // Bug#7: sendSMS now returns { success, error } instead of boolean
      const smsResults = await Promise.all(
        users
          .filter((u) => u.phone) // Bug#3 guard: skip users without phone
          .map((user) => this.sendSMS(user.phone, message)),
      );
      return { success: smsResults.every((r) => r.success), results: smsResults };
    } else {
      // Bug#3 FIX: filter out null/undefined phones before sending
      const phones = users.map((u) => u.phone).filter(Boolean) as string[];
      return this.sendWhatsAppBulk(phones, message);
    }
  }

  /**
   * Send WhatsApp notification to ALL active users registered in the database.
   */
  async sendWhatsAppToAllUsers(message: string): Promise<{ success: boolean; totalUsers: number; results: any }> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true, phone: true },
    });

    const phones = users.map((u) => u.phone).filter(Boolean);
    const result = await this.sendWhatsAppBulk(phones, message);

    return {
      success: result.success,
      totalUsers: users.length,
      results: result.results,
    };
  }

  /**
   * Verifies Meta X-Hub-Signature-256 HMAC-SHA256 signature using the app secret.
   * Rejects invalid or unsigned webhook requests.
   */
  verifyWebhookSignature(
    rawBody: Buffer | string | undefined,
    signatureHeader: string | undefined,
    secretOverride?: string,
  ): boolean {
    if (this.selfService) {
      return this.selfService.verifyWebhookSignature(rawBody, signatureHeader, secretOverride);
    }

    const candidates = [
      secretOverride,
      process.env.WHATSAPP_APP_SECRET,
      process.env.META_APP_SECRET,
    ];
    const appSecret = candidates
      .find((c): c is string => typeof c === 'string' && c.trim().length > 0)
      ?.trim();

    if (!appSecret) {
      throw new UnauthorizedException('Webhook app secret is not configured');
    }
    if (!signatureHeader || typeof signatureHeader !== 'string') {
      throw new UnauthorizedException('Missing webhook signature');
    }
    const trimmedSig = signatureHeader.trim();
    if (!trimmedSig.toLowerCase().startsWith('sha256=')) {
      throw new UnauthorizedException('Invalid webhook signature format');
    }
    const receivedHex = trimmedSig.slice('sha256='.length).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(receivedHex)) {
      throw new UnauthorizedException('Invalid webhook signature digest');
    }
    if (rawBody === undefined || rawBody === null) {
      throw new UnauthorizedException('Missing webhook payload body');
    }

    const payloadBuffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody), 'utf8');

    const expectedHex = crypto
      .createHmac('sha256', appSecret.trim())
      .update(payloadBuffer)
      .digest('hex')
      .toLowerCase();

    const expectedBuf = Buffer.from(expectedHex, 'utf8');
    const receivedBuf = Buffer.from(receivedHex, 'utf8');
    if (
      expectedBuf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    return true;
  }

  /**
   * Checks and records an incoming message ID for deduplication.
   * Returns true if the message ID is new and should be processed;
   * returns false if it has already been seen.
   */
  markMessageIdProcessed(messageId?: string | null): boolean {
    if (!messageId || typeof messageId !== 'string') return true;
    const id = messageId.trim();
    if (!id) return true;

    const now = Date.now();
    // Prune expired entries if map grows large
    if (this.processedMessageIds.size >= MessagingService.MESSAGE_DEDUP_MAX_SIZE) {
      for (const [k, ts] of this.processedMessageIds.entries()) {
        if (now - ts > MessagingService.MESSAGE_DEDUP_TTL_MS) {
          this.processedMessageIds.delete(k);
        }
      }
      if (this.processedMessageIds.size >= MessagingService.MESSAGE_DEDUP_MAX_SIZE) {
        const oldestKey = this.processedMessageIds.keys().next().value;
        if (oldestKey) this.processedMessageIds.delete(oldestKey);
      }
    }

    const existingTs = this.processedMessageIds.get(id);
    if (existingTs !== undefined && now - existingTs <= MessagingService.MESSAGE_DEDUP_TTL_MS) {
      return false;
    }

    this.processedMessageIds.set(id, now);
    return true;
  }

  /**
   * Releases an in-memory message ID claim if processing failed before commit.
   * This allows Meta's automated webhook retries to be re-attempted.
   */
  releaseMessageIdProcessed(messageId?: string | null): void {
    if (!messageId || typeof messageId !== 'string') return;
    const id = messageId.trim();
    if (id) {
      this.processedMessageIds.delete(id);
    }
  }

  /**
   * Validates the Meta WhatsApp event timestamp.
   * Meta sends Unix epoch integer seconds as a string (e.g. "1730592000").
   * Rejects missing, non-numeric, millisecond-scale, historical (<2020),
   * or future timestamps beyond the 300s (5-minute) clock-skew tolerance.
   * NEVER substitutes local server time or now.
   */
  validateMetaEventTimestamp(rawTimestamp: any, serverNowMs = Date.now()): Date | null {
    if (rawTimestamp === undefined || rawTimestamp === null) return null;
    const str = String(rawTimestamp).trim();
    if (!/^\d+$/.test(str)) return null;

    const seconds = Number(str);
    if (!Number.isSafeInteger(seconds)) return null;

    const minSeconds = 1577836800; // 2020-01-01
    const maxSkewSeconds = Math.floor(serverNowMs / 1000) + 300; // max 5 min future skew

    if (seconds < minSeconds || seconds > maxSkewSeconds) {
      return null;
    }

    return new Date(seconds * 1000);
  }

  /**
   * Resolves the incoming phone to EXACTLY ONE active, non-deleted worker.
   * Rejects ambiguous or unknown phone numbers without touching any plan records.
   */
  async resolveWorkerSender(rawPhone: string): Promise<{ id: string; name: string; phone?: string | null } | null> {
    if (this.selfService) {
      const resolved = await this.selfService.resolveWorkerByExactPhone(rawPhone);
      return resolved.status === 'MATCHED' ? resolved.worker : null;
    }

    const norm = this.normalizePhoneStrict(rawPhone);
    if (!norm) return null;

    const users = await this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, phone: true },
    });

    const matches = (users || []).filter(
      (u: any) => u.phone && this.normalizePhoneStrict(u.phone) === norm,
    );

    return matches.length === 1 ? matches[0] : null;
  }

  /**
   * Process Meta WhatsApp Cloud API webhook events
   */
  async handleWebhookPayload(
    body: any,
    options?: {
      signature?: string;
      rawBody?: Buffer | string;
      verifySignature?: boolean;
      referenceDate?: Date;
    },
  ): Promise<void> {
    if (options?.verifySignature || options?.signature !== undefined) {
      const raw =
        options?.rawBody ??
        (typeof body === 'string'
          ? Buffer.from(body, 'utf8')
          : Buffer.from(JSON.stringify(body ?? {}), 'utf8'));
      this.verifyWebhookSignature(raw, options?.signature);
    }

    if (!body || body.object !== 'whatsapp_business_account') return;

    // Top-level audit log so managers/admins can verify Meta reached the server
    await this.prisma.actionLog.create({
      data: {
        action: 'WHATSAPP_WEBHOOK_PAYLOAD',
        details: `Meta Webhook empfangen (Entries: ${body.entry?.length || 0})`,
      },
    }).catch(() => {});

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;

        // Log status updates (sent, delivered, read, failed)
        if (value.statuses && Array.isArray(value.statuses)) {
          for (const status of value.statuses) {
            this.logger.log(
              `[WhatsApp Webhook] Status: ${status.status} | Recipient: ${status.recipient_id} | MsgId: ${status.id}`,
            );
            if (status.errors && status.errors.length > 0) {
              const errInfo = JSON.stringify(status.errors);
              this.logger.error(
                `[WhatsApp Webhook] Delivery Error: ${errInfo}`,
              );
              this.prisma.actionLog
                .create({
                  data: {
                    action: 'WHATSAPP_DELIVERY_FAILED',
                    details: `WhatsApp-Zustellung an +${status.recipient_id} fehlgeschlagen (Status: ${status.status}): ${errInfo}`,
                  },
                })
                .catch(() => {});
            }
          }
        }

        // Process incoming messages from employees/users
        if (value.messages && Array.isArray(value.messages)) {
          for (const msg of value.messages) {
            await this.processIncomingWebhookMessage(msg, options?.referenceDate);
          }
        }
      }
    }
  }

  /**
   * Deterministically normalizes a phone number to E.164 digits without '+'.
   * Never uses last-digit or substring approximations.
   */
  normalizePhoneStrict(phone: string | null | undefined): string {
    if (this.selfService) {
      return this.selfService.normalizePhoneNumber(phone);
    }
    if (!phone || typeof phone !== 'string') return '';
    let cleaned = phone.trim();
    if (!cleaned || /[a-zA-Z]/.test(cleaned)) return '';
    cleaned = cleaned.replace(/^\+(\d{1,3})\s*\(0\)/, '+$1');
    cleaned = cleaned.replace(/^00(\d{1,3})\s*\(0\)/, '00$1');
    const hasPlus = cleaned.startsWith('+');
    let digits = cleaned.replace(/\D/g, '');
    if (!digits) return '';
    if (!hasPlus) {
      if (digits.startsWith('00')) {
        digits = digits.slice(2);
      } else if (digits.startsWith('0')) {
        digits = '49' + digits.slice(1);
      }
    }
    if (digits.length < 7 || digits.length > 15) return '';
    return digits;
  }

  /**
   * Matches the sender phone to EXACTLY ONE active user by exact normalized phone number.
   * Never uses last-digit/fuzzy matching. Returns null if unknown (0 matches) or ambiguous (>1 matches).
   */
  private async findUserByPhone(phone: string) {
    if (this.selfService) {
      const resolved = await this.selfService.resolveWorkerByExactPhone(phone);
      return resolved.status === 'MATCHED' ? resolved.worker : null;
    }

    const normalized = this.normalizePhoneStrict(phone);
    if (!normalized) return null;

    const activeUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
    });

    const matches = (activeUsers || []).filter(
      (u: any) => u.phone && this.normalizePhoneStrict(u.phone) === normalized,
    );

    if (matches.length !== 1) {
      return null;
    }
    return matches[0];
  }

  /**
   * Helper to find pending or upcoming assignment for an employee.
   */
  private async findPendingOrRecentAssignment(userId: string) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    let assignment = await this.prisma.planEmployee.findFirst({
      where: {
        employeeId: userId,
        plan: {
          date: { gte: todayStart },
          deletedAt: null,
        },
        confirmationStatus: 'PENDING',
      },
      orderBy: { plan: { date: 'asc' } },
      include: { plan: true },
    });

    if (!assignment) {
      assignment = await this.prisma.planEmployee.findFirst({
        where: {
          employeeId: userId,
          plan: { deletedAt: null },
        },
        orderBy: { plan: { date: 'desc' } },
        include: { plan: true },
      });
    }

    return assignment;
  }

  /**
   * Executes a guarded atomic update on a worker's PlanEmployee assignment inside a single transaction.
   * Updates PlanEmployee only if respondedAt is null or strictly older than the eventDate.
   * Commits PlanEmployee, required EmployeeAbsence sync (if SICK), and ActionLog together.
   * Required write failures are NOT swallowed.
   */
  // Documented legacy button labels for exact full-string matching only (strictly NO substring/includes matching)
  private static readonly EXACT_CONFIRM_LABELS = new Set([
    'confirm',
    'accept',
    'ich bin da',
    '✅ ich bin da',
    'bin da',
    'ja',
    'evet',
    'buradayım',
    'buradayim',
    'حاضر',
    'سأحضر',
    'نعم',
    'я буду',
    'прийду',
    'так',
  ]);

  private static readonly EXACT_SICK_LABELS = new Set([
    'sick',
    'decline',
    'ich bin krank',
    '🤒 ich bin krank',
    'krank',
    'nein',
    'hasta',
    'hastayım',
    'hastayim',
    'مريض',
    'لا',
    'захворів',
    'хворий',
    'ні',
  ]);

  private static readonly EXACT_CUSTOM_LABELS = new Set([
    'custom',
    'custom nachricht',
    '💬 custom nachricht',
    'schreib nachricht',
    'nachricht',
    'rücksprache',
    'ruecksprache',
    'mesaj',
    'رسالة',
    'повідомлення',
  ]);

  /**
   * Resolves a button label or ID strictly via exact full-string match against documented template labels.
   * Never uses substring matching (`includes`).
   */
  private resolveActionFromLabel(raw?: string | null): 'CONFIRM' | 'SICK' | 'CUSTOM' | null {
    if (!raw || typeof raw !== 'string') return null;
    const clean = raw.trim().toLowerCase();
    if (!clean) return null;

    const isConfirm = MessagingService.EXACT_CONFIRM_LABELS.has(clean);
    const isSick = MessagingService.EXACT_SICK_LABELS.has(clean);
    const isCustom = MessagingService.EXACT_CUSTOM_LABELS.has(clean);

    const matchCount = (isConfirm ? 1 : 0) + (isSick ? 1 : 0) + (isCustom ? 1 : 0);
    if (matchCount !== 1) return null;
    if (isConfirm) return 'CONFIRM';
    if (isSick) return 'SICK';
    return 'CUSTOM';
  }

  /**
   * Executes a guarded atomic update on a worker's PlanEmployee assignment inside a single transaction.
   * Updates PlanEmployee only if respondedAt is null or strictly older than the eventDate.
   * Commits PlanEmployee, required EmployeeAbsence sync (if SICK), and ActionLog together.
   * Required write failures are NOT swallowed.
   */
  private async executeGuardedAssignmentUpdate(params: {
    planId: string;
    employeeId: string;
    eventDate: Date;
    status: 'CONFIRMED' | 'SICK' | 'CUSTOM_RESPONSE';
    note: string;
    channel: 'WHATSAPP_BUTTON' | 'WHATSAPP_TEXT';
    actionType: string;
    actionDetails: string;
    requiredCurrentStatus?: string;
    requiredCurrentNote?: string;
  }): Promise<{ accepted: boolean }> {
    return await this.prisma.$transaction(async (tx: any) => {
      const whereClause: any = {
        planId: params.planId,
        employeeId: params.employeeId,
        OR: [
          { respondedAt: null },
          { respondedAt: { lt: params.eventDate } },
        ],
      };

      if (params.requiredCurrentStatus) {
        whereClause.confirmationStatus = params.requiredCurrentStatus;
      }
      if (params.requiredCurrentNote) {
        whereClause.responseNote = params.requiredCurrentNote;
      }

      const updateRes = await tx.planEmployee.updateMany({
        where: whereClause,
        data: {
          confirmationStatus: params.status,
          responseNote: params.note,
          respondedAt: params.eventDate,
          responseChannel: params.channel,
        },
      });

      if (updateRes.count === 0) {
        return { accepted: false };
      }

      // If status is SICK, sync with EmployeeAbsence
      if (params.status === 'SICK') {
        const plan = await tx.plan.findUnique({ where: { id: params.planId } });
        if (!plan) {
          throw new Error(`Plan ${params.planId} not found during absence synchronization`);
        }
        const normDate = new Date(plan.date);
        normDate.setUTCHours(0, 0, 0, 0);

        await tx.employeeAbsence.upsert({
          where: {
            employeeId_date: {
              employeeId: params.employeeId,
              date: normDate,
            },
          },
          create: {
            employeeId: params.employeeId,
            date: normDate,
            status: 'KRANK',
            reason: params.note,
          },
          update: {
            status: 'KRANK',
            reason: params.note,
          },
        });
      }

      // Record audit log
      await tx.actionLog.create({
        data: {
          userId: params.employeeId,
          action: params.actionType,
          details: params.actionDetails,
        },
      });

      return { accepted: true };
    });
  }

  /**
   * Process individual incoming message:
   * - Deduplicates incoming message IDs (msg.id).
   * - Validates Meta event timestamp in integer seconds (rejects missing/invalid/future).
   * - Strictly resolves sender to exactly one active, non-deleted worker.
   * - Verifies sender-to-actual-assignment authorization.
   * - Executes atomic conditional updates inside a transaction (commit before acknowledgment).
   * - Releases in-memory dedup claims on transaction failure and propagates error for retry.
   * - Restricts follow-up notes only to assignments awaiting a note; otherwise clarifies.
   * - Routes read-only questions to Phase-1 Worker Self-Service without touching plan status.
   */
  async processIncomingWebhookMessage(msg: any, referenceDate?: Date): Promise<void> {
    if (!msg) return;

    // Deduplicate incoming message ID
    if (msg.id && !this.markMessageIdProcessed(String(msg.id))) {
      this.logger.warn(
        `[WhatsApp Webhook] Duplicate incoming message ID ignored: ${msg.id}`,
      );
      return;
    }

    let committed = false;
    try {
      const rawFrom = String(msg.from || '').trim();
      const cleanFrom = this.normalizePhoneStrict(rawFrom) || this.formatPhoneNumber(rawFrom);

      // 1. Validate Meta event timestamp in integer seconds
      const serverNowMs = referenceDate ? referenceDate.getTime() : Date.now();
      const eventDate = this.validateMetaEventTimestamp(msg.timestamp, serverNowMs);
      if (!eventDate) {
        this.logger.warn(
          `[WhatsApp Webhook] Rejected message from +${rawFrom}: invalid/missing/future event timestamp "${msg.timestamp}"`,
        );
        return;
      }

      // 2. Resolve sender to exactly one active, non-deleted worker
      const resolvedSender = await this.resolveWorkerSender(rawFrom);
      if (!resolvedSender) {
        this.logger.warn(
          `[WhatsApp Webhook] Sender +${rawFrom} does not resolve to exactly one active worker. Rejecting.`,
        );
        await this.prisma.actionLog.create({
          data: {
            action: 'WHATSAPP_UNKNOWN_SENDER',
            details: `WhatsApp-Nachricht von nicht eindeutig zugeordneter Nummer +${rawFrom}`,
          },
        }).catch(() => {});
        return;
      }

      const isInteractive = msg.type === 'interactive' && Boolean(msg.interactive?.button_reply);
      const isTemplateButton = msg.type === 'button' && Boolean(msg.button?.text || msg.button?.payload);

      // ─── 3. Button / Interactive Replies ───────────────────────────────────
      if (isInteractive || isTemplateButton) {
        const buttonId = (
          msg.interactive?.button_reply?.id ||
          msg.button?.payload ||
          msg.button?.text ||
          ''
        ).trim();

        const buttonTitle = (
          msg.interactive?.button_reply?.title ||
          msg.button?.text ||
          msg.button?.payload ||
          ''
        ).trim();

        this.logger.log(
          `[WhatsApp Webhook] 🔘 User clicked ${msg.type} button: "${buttonTitle}" (ID/Payload: "${buttonId}") from +${cleanFrom}`,
        );

        const parts = buttonId.split('_');
        const rawPrefix = parts[0]?.toUpperCase() || '';
        let targetPlanId = parts[1] || '';
        let targetEmpId = parts.slice(2).join('_') || '';

        // 1. Strict parsed action token from button ID prefix
        let actionFromId: 'CONFIRM' | 'SICK' | 'CUSTOM' | null = null;
        if (rawPrefix === 'CONFIRM' || rawPrefix === 'ACCEPT') {
          actionFromId = 'CONFIRM';
        } else if (rawPrefix === 'SICK' || rawPrefix === 'DECLINE') {
          actionFromId = 'SICK';
        } else if (rawPrefix === 'CUSTOM') {
          actionFromId = 'CUSTOM';
        } else {
          // Exact full-string match only for legacy button IDs (never substring)
          actionFromId = this.resolveActionFromLabel(buttonId);
        }

        // Structured IDs must be complete and have a recognized action. Never
        // reinterpret a broken plan/worker target as an unrelated pending shift.
        const knownActionPrefix = ['CONFIRM', 'ACCEPT', 'SICK', 'DECLINE', 'CUSTOM'].includes(rawPrefix);
        const structuredPayload = parts.length >= 3 || (knownActionPrefix && buttonId.includes('_'));
        if (structuredPayload && (!knownActionPrefix || !targetPlanId || !targetEmpId)) {
          this.logger.warn('[WhatsApp Webhook] Unknown button action ID or malformed structured button payload');
          return;
        }

        // 2. Strict exact full-string match for button title
        const actionFromTitle = this.resolveActionFromLabel(buttonTitle);

        // Check for negative title (e.g. "Ich bin nicht da", "Nein, nicht da")
        const isNegativeTitle = /\b(nicht|kein|keine|not|hayır|hayir)\b/i.test(buttonTitle);

        let actionPrefix: 'CONFIRM' | 'SICK' | 'CUSTOM' | null = null;
        if (isNegativeTitle && actionFromId === 'CONFIRM') {
          // Conflicting negative title overrides confirm ID
          actionPrefix = null;
        } else if (actionFromId && actionFromTitle) {
          if (actionFromId === actionFromTitle) {
            actionPrefix = actionFromId;
          } else {
            // Conflicting action between ID and title (e.g. ID says CONFIRM but title says SICK)
            actionPrefix = null;
          }
        } else if (actionFromId) {
          actionPrefix = actionFromId;
        } else if (actionFromTitle) {
          actionPrefix = actionFromTitle;
        }

        // Action allowlist check: ignore unknown or conflicting payloads without writing
        if (!actionPrefix) {
          this.logger.warn(
            `[WhatsApp Webhook] Unknown button action ID "${buttonId}" (title: "${buttonTitle}"). Ignored without writing.`,
          );
          return;
        }

        // Verify assignment ownership and existence
        if (targetPlanId && targetEmpId) {
          if (targetEmpId !== resolvedSender.id) {
            this.logger.warn(
              `[WhatsApp Webhook] Sender +${rawFrom} (${resolvedSender.id}) does not match button target employee ${targetEmpId}; ignoring.`,
            );
            return;
          }

          const assignment = await this.prisma.planEmployee.findFirst({
            where: {
              planId: targetPlanId,
              employeeId: resolvedSender.id,
              plan: { deletedAt: null },
            },
            include: { plan: true },
          });

          if (!assignment) {
            this.logger.warn(
              `[WhatsApp Webhook] Assignment for plan ${targetPlanId} and worker ${resolvedSender.id} not found or deleted; ignoring.`,
            );
            return;
          }
        } else {
          const todayStart = new Date(serverNowMs);
          todayStart.setUTCHours(0, 0, 0, 0);

          const pendingAssignments = await this.prisma.planEmployee.findMany({
            where: {
              employeeId: resolvedSender.id,
              confirmationStatus: 'PENDING',
              plan: {
                date: { gte: todayStart },
                deletedAt: null,
              },
            },
            orderBy: { plan: { date: 'asc' } },
            include: { plan: true },
          });

          if (pendingAssignments.length === 0) {
            this.logger.warn(`[WhatsApp Webhook] No pending assignment found for worker ${resolvedSender.id}`);
            await this.sendWhatsAppDirect(
              cleanFrom,
              'Für Ihre Rufnummer liegt derzeit keine offene Schicht zur Bestätigung vor.',
            ).catch(() => {});
            return;
          }

          if (pendingAssignments.length > 1) {
            this.logger.warn(`[WhatsApp Webhook] Ambiguous plan: worker ${resolvedSender.id} has ${pendingAssignments.length} pending plans`);
            await this.sendWhatsAppDirect(
              cleanFrom,
              'Wir haben mehrere offene Schichten für Sie gefunden. Bitte antworten Sie direkt über die Schaltflächen in der jeweiligen Schichtplan-Nachricht.',
            ).catch(() => {});
            return;
          }

          targetPlanId = pendingAssignments[0].planId;
          targetEmpId = resolvedSender.id;
        }

        let noteText = '';
        let actionType = '';
        let actionDetails = '';
        let ackMessage = '';

        if (actionPrefix === 'CONFIRM') {
          noteText = 'Zugesagt („Ich bin da“)';
          actionType = 'WHATSAPP_CONFIRMED';
          actionDetails = 'Mitarbeiter hat Schicht zugesagt („Ich bin da“) via WhatsApp-Button';
          ackMessage = '✅ Vielen Dank! Ihre Zusage („Ich bin da“) wurde erfolgreich gespeichert. Wir freuen uns auf Ihren Einsatz!';
        } else if (actionPrefix === 'SICK') {
          noteText = 'Krankmeldung via WhatsApp („Ich bin krank“)';
          actionType = 'WHATSAPP_SICK_REPORT';
          actionDetails = 'Mitarbeiter hat sich krank gemeldet („Ich bin krank“) via WhatsApp-Button';
          ackMessage = '🤒 Ihre Krankmeldung wurde erfasst und an die Schichtleitung übermittelt. Gute Besserung!';
        } else {
          noteText = 'Wartet auf individuelle Textnachricht';
          actionType = 'WHATSAPP_NOTE_RECEIVED';
          actionDetails = 'Mitarbeiter hat "Schreib Nachricht" gewählt via WhatsApp-Button';
          ackMessage = '💬 Bitte schreiben Sie uns direkt hier im Chat eine kurze Nachricht (z. B. Grund der Verhinderung oder wann Sie kommen können).';
        }

        const result = await this.executeGuardedAssignmentUpdate({
          planId: targetPlanId,
          employeeId: targetEmpId,
          eventDate,
          status: actionPrefix === 'CONFIRM' ? 'CONFIRMED' : actionPrefix === 'SICK' ? 'SICK' : 'CUSTOM_RESPONSE',
          note: noteText,
          channel: 'WHATSAPP_BUTTON',
          actionType,
          actionDetails,
        });

        if (result.accepted) {
          committed = true;
          await this.sendWhatsAppDirect(cleanFrom, ackMessage).catch((err) => {
            this.logger.error(`[WhatsApp Webhook] Outbound acknowledgment delivery failed to +${cleanFrom}: ${err.message}`);
          });
        } else {
          this.logger.warn(
            `[WhatsApp Webhook] Dropped stale/superseded button reply for plan ${targetPlanId}, employee ${targetEmpId} (event: ${eventDate.toISOString()})`,
          );
        }
        return;
      }

      // ─── 4. Text Messages ──────────────────────────────────────────────────
      if (msg.type === 'text' && msg.text?.body) {
        const incomingText = msg.text.body.trim();
        this.logger.log(`[WhatsApp Webhook] Received text from +${rawFrom}: "${incomingText}"`);

        // 4a. Check if text is an explicit plan option reply: 1, 2, 3
        const lower = incomingText.toLowerCase();
        let explicitAction: 'CONFIRM' | 'SICK' | 'CUSTOM' | null = null;
        if (
          lower === '1' ||
          lower === 'ich bin da' ||
          lower === 'bin da' ||
          lower === 'komme' ||
          lower === 'ja' ||
          lower === 'evet' ||
          lower === 'buradayım' ||
          lower === 'buradayim' ||
          lower === 'حاضر' ||
          lower === 'نعم' ||
          lower === 'я буду' ||
          lower === 'прийду' ||
          lower === 'так'
        ) {
          explicitAction = 'CONFIRM';
        } else if (
          lower === '2' ||
          lower === 'ich bin krank' ||
          lower === 'krank' ||
          lower === 'arzt' ||
          lower === 'nein' ||
          lower === 'hasta' ||
          lower === 'hastayım' ||
          lower === 'hastayim' ||
          lower === 'مريض' ||
          lower === 'لا' ||
          lower === 'захворів' ||
          lower === 'хворий' ||
          lower === 'ні'
        ) {
          explicitAction = 'SICK';
        } else if (
          lower === '3' ||
          lower === 'nachricht' ||
          lower === 'rücksprache' ||
          lower === 'ruecksprache' ||
          lower === 'mesaj' ||
          lower === 'رسالة' ||
          lower === 'повідомлення'
        ) {
          explicitAction = 'CUSTOM';
        }

        if (explicitAction) {
          const todayStart = new Date(serverNowMs);
          todayStart.setUTCHours(0, 0, 0, 0);

          const pendingAssignments = await this.prisma.planEmployee.findMany({
            where: {
              employeeId: resolvedSender.id,
              confirmationStatus: 'PENDING',
              plan: {
                date: { gte: todayStart },
                deletedAt: null,
              },
            },
            orderBy: { plan: { date: 'asc' } },
            include: { plan: true },
          });

          if (pendingAssignments.length === 0) {
            await this.sendWhatsAppDirect(
              cleanFrom,
              'Für Ihre Rufnummer liegt derzeit keine offene Schicht zur Bestätigung vor.',
            ).catch(() => {});
            return;
          }

          if (pendingAssignments.length > 1) {
            await this.sendWhatsAppDirect(
              cleanFrom,
              'Wir haben mehrere offene Schichten für Sie gefunden. Bitte antworten Sie direkt über die Schaltflächen in der jeweiligen Schichtplan-Nachricht.',
            ).catch(() => {});
            return;
          }

          const targetAssignment = pendingAssignments[0];
          let noteText = '';
          let actionType = '';
          let actionDetails = '';
          let ackMessage = '';

          if (explicitAction === 'CONFIRM') {
            noteText = `Zugesagt („${incomingText}“)`;
            actionType = 'WHATSAPP_CONFIRMED';
            actionDetails = `Mitarbeiter hat Schicht zugesagt via WhatsApp-Text („${incomingText}“)`;
            ackMessage = '✅ Vielen Dank! Ihre Zusage („Ich bin da“) wurde erfolgreich gespeichert. Wir freuen uns auf Ihren Einsatz!';
          } else if (explicitAction === 'SICK') {
            noteText = `Krankmeldung via WhatsApp-Text („${incomingText}“)`;
            actionType = 'WHATSAPP_SICK_REPORT';
            actionDetails = `Mitarbeiter hat sich krank gemeldet via WhatsApp-Text („${incomingText}“)`;
            ackMessage = '🤒 Ihre Krankmeldung wurde erfasst und an die Schichtleitung übermittelt. Gute Besserung!';
          } else {
            noteText = 'Wartet auf individuelle Textnachricht';
            actionType = 'WHATSAPP_NOTE_RECEIVED';
            actionDetails = `Mitarbeiter hat Option 3 gewählt via WhatsApp-Text („${incomingText}“)`;
            ackMessage = '💬 Bitte schreiben Sie uns direkt hier im Chat eine kurze Nachricht (z. B. Grund der Verhinderung oder wann Sie kommen können).';
          }

          const result = await this.executeGuardedAssignmentUpdate({
            planId: targetAssignment.planId,
            employeeId: resolvedSender.id,
            eventDate,
            status: explicitAction === 'CONFIRM' ? 'CONFIRMED' : explicitAction === 'SICK' ? 'SICK' : 'CUSTOM_RESPONSE',
            note: noteText,
            channel: 'WHATSAPP_TEXT',
            actionType,
            actionDetails,
          });

          if (result.accepted) {
            committed = true;
            await this.sendWhatsAppDirect(cleanFrom, ackMessage).catch((err) => {
              this.logger.error(`[WhatsApp Webhook] Outbound acknowledgment delivery failed to +${cleanFrom}: ${err.message}`);
            });
          } else {
            this.logger.warn(
              `[WhatsApp Webhook] Dropped stale/superseded text reply for plan ${targetAssignment.planId}, employee ${resolvedSender.id} (event: ${eventDate.toISOString()})`,
            );
          }
          return;
        }

        // 4b. Check read-only self-service questions & cross-worker/mutation protections BEFORE follow-up note capture!
        if (this.selfService) {
          let otherNames: string[] = [];
          try {
            const otherUsers = await this.prisma.user.findMany({
              where: { isActive: true, deletedAt: null, NOT: { id: resolvedSender.id } },
              select: { name: true },
            });
            otherNames = (otherUsers || []).map((u: any) => u.name).filter(Boolean);
          } catch (_) {}

          const parsed = this.selfService.parseWorkerMessage(
            incomingText,
            referenceDate ?? new Date(),
            resolvedSender.name,
            otherNames,
          );

          if (
            parsed.intent === 'HOURS' ||
            parsed.intent === 'PLANS' ||
            parsed.intent === 'CROSS_WORKER_ACCESS' ||
            parsed.intent === 'MUTATION_ATTEMPT'
          ) {
            const convResult = await this.selfService.handleIncomingConversation(
              rawFrom,
              incomingText,
              referenceDate,
            );
            if (convResult.replyText) {
              await this.sendWhatsAppDirect(cleanFrom, convResult.replyText).catch(() => {});
            }
            return;
          }
        }

        // 4c. Follow-up note capture ONLY for assignment uniquely awaiting a note
        const todayStart = new Date(serverNowMs);
        todayStart.setUTCHours(0, 0, 0, 0);

        const awaitingAssignments = await this.prisma.planEmployee.findMany({
          where: {
            employeeId: resolvedSender.id,
            confirmationStatus: 'CUSTOM_RESPONSE',
            responseNote: 'Wartet auf individuelle Textnachricht',
            plan: {
              date: { gte: todayStart },
              deletedAt: null,
            },
          },
          include: { plan: true },
        });

        if (awaitingAssignments.length === 1) {
          const awaitingAssignment = awaitingAssignments[0];
          const result = await this.executeGuardedAssignmentUpdate({
            planId: awaitingAssignment.planId,
            employeeId: resolvedSender.id,
            eventDate,
            status: 'CUSTOM_RESPONSE',
            note: incomingText,
            channel: 'WHATSAPP_TEXT',
            actionType: 'WHATSAPP_NOTE_RECEIVED',
            actionDetails: `Mitarbeiter hat Notiz gesendet: "${incomingText}"`,
            requiredCurrentStatus: 'CUSTOM_RESPONSE',
            requiredCurrentNote: 'Wartet auf individuelle Textnachricht',
          });

          if (result.accepted) {
            committed = true;
            await this.sendWhatsAppDirect(
              cleanFrom,
              '✅ Vielen Dank für Ihre Rückmeldung! Ihre Nachricht wurde gespeichert und an die Schichtleitung weitergeleitet.',
            ).catch(() => {});
          } else {
            this.logger.warn(
              `[WhatsApp Webhook] Dropped stale or already-consumed follow-up note for plan ${awaitingAssignment.planId}, employee ${resolvedSender.id}`,
            );
          }
          return;
        }

        // 4d. Ambiguous or unrecognized text: clarify without mutating records
        await this.sendWhatsAppDirect(
          cleanFrom,
          'Vielen Dank für Ihre Nachricht. Wenn Sie eine Schicht bestätigen oder sich krankmelden möchten, nutzen Sie bitte die Schaltflächen in Ihrer Schichtplan-Nachricht. Für Auskünfte zu Ihren Arbeitszeiten oder Plänen fragen Sie z. B. „Wie viele Stunden habe ich diesen Monat?“',
        ).catch(() => {});
        return;
      }
    } catch (err: any) {
      if (!committed) {
        this.releaseMessageIdProcessed(msg.id);
      }
      throw err;
    }
  }

  /**
   * Diagnostic helper: Simulates an incoming WhatsApp message as if received by Meta webhook
   */
  async simulateIncomingMessage(phone: string, text: string): Promise<{ success: boolean; message: string }> {
    const fakeMsg = {
      id: `sim-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      from: phone,
      type: 'text',
      text: { body: text },
    };
    await this.processIncomingWebhookMessage(fakeMsg);
    return {
      success: true,
      message: `Simulierte WhatsApp-Antwort („${text}“) für +${this.formatPhoneNumber(phone)} erfolgreich verarbeitet.`,
    };
  }

  /**
   * Diagnostic helper: Return configuration guide for Meta Developer Console
   */
  getWebhookStatus() {
    const verifyTokenConfigured =
      typeof process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN === 'string' &&
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN.trim().length > 0;
    const callbackUrl = 'https://warehause-test.onrender.com/messaging/webhook';
    return {
      callbackUrl,
      verifyTokenConfigured,
      requiredWebhookField: 'messages',
      instructions:
        'In der Meta Developer Console (developers.facebook.com): App -> WhatsApp -> Konfiguration -> Webhook-Felder -> Verwalten -> "messages" abonnieren. Als Verifizierungs-Token den selbst gewaehlten Wert der Server-Umgebungsvariablen WHATSAPP_WEBHOOK_VERIFY_TOKEN eintragen (der Wert wird aus Sicherheitsgruenden nicht angezeigt).',
    };
  }

  /**
   * Send an interactive WhatsApp message with quick-reply buttons (Meta Cloud API).
   * Up to 3 buttons allowed by Meta. Falls back to UltraMsg or wa.me link.
   */
  async sendWhatsAppInteractive(
    phone: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    headerText?: string,
    footerText?: string,
  ): Promise<{ success: boolean; data?: any; error?: string; waLink?: string }> {
    const cleanedPhone = this.formatPhoneNumber(phone);

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v22.0';

    const ultraInstance = process.env.ULTRAMSG_INSTANCE_ID;
    const ultraToken = process.env.ULTRAMSG_TOKEN;

    // Limit to max 3 buttons per WhatsApp Cloud API specification
    const validButtons = (buttons || []).slice(0, 3).map((btn, idx) => ({
      type: 'reply',
      reply: {
        id: (btn.id || `btn_${idx}`).substring(0, 256),
        title: (btn.title || `Button ${idx + 1}`).substring(0, 20),
      },
    }));

    // Formatted fallback text with options listed clearly
    const optionsText = validButtons.length > 0
      ? '\n\n' + validButtons.map((b, i) => `${i + 1} - ${b.reply.title}`).join('\n')
      : '';
    const fullBodyWithOptions = `${bodyText}${optionsText}`;
    const waLink = this.generateWhatsAppLink(phone, fullBodyWithOptions);

    if (validButtons.length === 0) {
      return this.sendWhatsAppDirect(phone, bodyText);
    }

    // 1. Try Meta Cloud API if configured
    if (phoneNumberId && accessToken) {
      const interactivePayload: any = {
        type: 'button',
        body: {
          text: bodyText,
        },
        action: {
          buttons: validButtons,
        },
      };

      if (headerText) {
        interactivePayload.header = {
          type: 'text',
          text: headerText.substring(0, 60),
        };
      }

      if (footerText) {
        interactivePayload.footer = {
          text: footerText.substring(0, 60),
        };
      }

      const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanedPhone,
            type: 'interactive',
            interactive: interactivePayload,
          }),
        });

        const resData = await response.json();

        if (response.ok) {
          this.logger.log(
            `Interactive WhatsApp button message sent to +${cleanedPhone} (${validButtons.length} buttons)`,
          );
          return { success: true, data: resData, waLink };
        } else {
          const errorMsg =
            resData.error?.message || 'Meta API rejected interactive button message';
          this.logger.warn(
            `Failed sending interactive WhatsApp message to +${cleanedPhone}: ${errorMsg}`,
          );

          // Fallback to UltraMsg if configured
          if (ultraInstance && ultraToken) {
            this.logger.log(`Attempting UltraMsg fallback for +${cleanedPhone}...`);
            const ultraRes = await this.sendWhatsAppDirect(phone, fullBodyWithOptions);
            if (ultraRes.success) {
              return ultraRes;
            }
          }

          // Fallback: If 24-hour window is closed (Meta Error 131047 / re-engagement), try approved template
          if (
            resData.error?.code === 131047 ||
            errorMsg.includes('24 hours') ||
            errorMsg.includes('re-engagement')
          ) {
            this.logger.log(
              `24h window closed for +${cleanedPhone}. Attempting approved template fallback...`,
            );
            // Meta Template parameters strictly forbid newlines (\n) or tabs (\t)
            const cleanSummary = bodyText
              .replace(/[\r\n\t]+/g, ' | ')
              .replace(/\s{2,}/g, ' ')
              .trim()
              .substring(0, 200);

            return this.sendWhatsAppTemplate(phone, undefined, [
              headerText || 'Mitarbeiter',
              cleanSummary,
            ]);
          }

          return { success: false, error: errorMsg, waLink };
        }
      } catch (err: any) {
        this.logger.error(`Error sending interactive WhatsApp message: ${err.message}`);
        if (ultraInstance && ultraToken) {
          const ultraRes = await this.sendWhatsAppDirect(phone, fullBodyWithOptions);
          if (ultraRes.success) return ultraRes;
        }
        return { success: false, error: err.message, waLink };
      }
    }

    // 2. If Meta is not configured, try UltraMsg directly
    if (ultraInstance && ultraToken) {
      return this.sendWhatsAppDirect(phone, fullBodyWithOptions);
    }

    // 3. Fallback when no credentials configured
    return {
      success: false,
      error: 'Keine WhatsApp-API Zugangsdaten konfiguriert (Meta / UltraMsg). Bitte wa.me Link nutzen.',
      waLink,
    };
  }

  /**
   * Unified, highly-reliable Shift Plan WhatsApp Notification:
   *
   * TIER 1: Meta Template `schichtplan_benachrichtigung` (if Meta credentials present)
   *   - Approved by Meta, delivered outside the 24-hour window to ANY valid phone number.
   *   - Clean parameters:
   *       {{1}} = Employee name
   *       {{2}} = Einsatzort, Halle, Treffpunkt, Datum, Schicht, Rückmelde-Optionen
   *
   * TIER 2: Meta Interactive Buttons (if 24h window active or template not approved)
   *   - 3 buttons: [✅ Ich bin da], [🤒 Ich bin krank], [💬 Custom Nachricht]
   *
   * TIER 3: UltraMsg Direct WhatsApp API (if configured)
   *   - No 24h window limitation, delivers full formatted multi-line message.
   *
   * TIER 4: Manual WhatsApp Web Fallback (`waLink`)
   *   - Pre-formatted https://wa.me/... URL for 1-click dispatch.
   */
  async sendShiftPlanNotification(options: {
    phone: string;
    empName: string;
    warehouseName: string;
    hallName: string;
    treffpunktInfo: string;
    dateFormatted: string;
    shiftTime: string;
    planId: string;
    employeeId: string;
    headerTitle?: string;
  }): Promise<{ success: boolean; method?: string; error?: string; waLink?: string; data?: any }> {
    const {
      phone,
      empName,
      warehouseName,
      hallName,
      treffpunktInfo,
      dateFormatted,
      shiftTime,
      planId,
      employeeId,
      headerTitle,
    } = options;

    const cleanedPhone = this.formatPhoneNumber(phone);

    // 1. Structure the full multi-line message as requested by user
    const fullBodyText =
      `Hallo ${empName}\n` +
      `Ihr Einsatzort : ${warehouseName}\n` +
      `Halle : ${hallName}\n` +
      `Treffpunkt & Treffzeit: ${treffpunktInfo}\n\n` +
      `📅 Datum: ${dateFormatted} | 🕒 Schicht: ${shiftTime}\n\n` +
      `Bitte wählen Sie eine der folgenden Optionen:\n` +
      `1 - ✅ Ich bin da\n` +
      `2 - 🤒 Ich bin krank\n` +
      `3 - 💬 Custom Nachricht`;

    const buttons = [
      { id: `CONFIRM_${planId}_${employeeId}`, title: '✅ Ich bin da' },
      { id: `SICK_${planId}_${employeeId}`, title: '🤒 Ich bin krank' },
      { id: `CUSTOM_${planId}_${employeeId}`, title: '💬 Custom Nachricht' },
    ];

    const waLink = this.generateWhatsAppLink(phone, fullBodyText);

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const ultraInstance = process.env.ULTRAMSG_INSTANCE_ID;
    const ultraToken = process.env.ULTRAMSG_TOKEN;

    // 2. If UltraMsg is configured without Meta, send full message directly
    if (ultraInstance && ultraToken && (!phoneNumberId || !accessToken)) {
      const ultraRes = await this.sendWhatsAppDirect(phone, fullBodyText);
      return { ...ultraRes, method: 'ULTRAMSG', waLink };
    }

    // 3. If Meta Cloud API is configured:
    if (phoneNumberId && accessToken) {
      // Clean, single-line shift details for Meta Template (strictly NO newlines)
      const cleanShiftDetails =
        `Einsatzort: ${warehouseName} (${hallName}) | Treffpunkt: ${treffpunktInfo} | Datum: ${dateFormatted} (${shiftTime})`
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim()
          .substring(0, 200);

      const templateButtonPayloads = [
        `CONFIRM_${planId}_${employeeId}`,
        `SICK_${planId}_${employeeId}`,
        `CUSTOM_${planId}_${employeeId}`,
      ];

      // Strategy 1 (PRIMARY): Approved Meta Template `schichtplan_benachrichtigung`
      // Guaranteed delivery outside 24-hour window, displays approved quick-reply buttons,
      // and records directly in Meta Business Manager Vorlagen-Insights.
      this.logger.log(`Attempting approved Meta template 'schichtplan_benachrichtigung' for +${cleanedPhone}...`);
      const templateRes = await this.sendWhatsAppTemplate(
        phone,
        'schichtplan_benachrichtigung',
        [empName, cleanShiftDetails],
        'de',
        templateButtonPayloads,
      );

      if (templateRes.success) {
        this.logger.log(`✓ Meta template 'schichtplan_benachrichtigung' delivered to +${cleanedPhone}`);
        return { success: true, method: 'META_TEMPLATE', waLink, data: templateRes.data };
      }

      this.logger.warn(
        `Meta template delivery rejected for +${cleanedPhone}: ${templateRes.error}. Falling back to interactive buttons...`,
      );

      // Strategy 2: Interactive Buttons (if 24h conversation window happens to be open)
      this.logger.log(`Attempting Meta interactive button fallback for +${cleanedPhone}...`);
      const interactiveRes = await this.sendWhatsAppInteractive(
        phone,
        fullBodyText,
        buttons,
        headerTitle || 'LogiFlow Schichtplan',
        'LogiFlow Warehouse',
      );

      if (interactiveRes.success) {
        this.logger.log(`✓ Meta interactive buttons delivered as fallback to +${cleanedPhone}`);
        return { success: true, method: 'META_INTERACTIVE', waLink, data: interactiveRes.data };
      }

      // Tertiary Strategy: UltraMsg fallback if available
      if (ultraInstance && ultraToken) {
        this.logger.log(`Attempting UltraMsg fallback for +${cleanedPhone}...`);
        const ultraRes = await this.sendWhatsAppDirect(phone, fullBodyText);
        if (ultraRes.success) {
          return { ...ultraRes, method: 'ULTRAMSG_FALLBACK', waLink };
        }
      }

      return {
        success: false,
        method: 'FAILED',
        error: templateRes.error || interactiveRes.error || 'Meta API rejected message',
        waLink,
      };
    }

    // 4. No credentials configured
    return {
      success: false,
      method: 'NO_CREDENTIALS',
      error: 'Keine WhatsApp-API Zugangsdaten konfiguriert (Meta / UltraMsg). Bitte wa.me Link nutzen.',
      waLink,
    };
  }

  /**
   * Send an approved WhatsApp Message Template (Meta Cloud API).
   * Works outside the 24-hour customer service window for any recipient.
   * Supports Quick Reply button payloads and automatic resilient fallbacks.
   */
  async sendWhatsAppTemplate(
    phone: string,
    templateName?: string,
    parameters: string[] = [],
    languageCode = 'de',
    buttonPayloads?: string[],
  ): Promise<{ success: boolean; data?: any; error?: string; waLink?: string }> {
    const cleanedPhone = this.formatPhoneNumber(phone);
    const template =
      templateName || process.env.WHATSAPP_TEMPLATE_NAME || 'schichtplan_benachrichtigung';
    const waLink = this.generateWhatsAppLink(phone, parameters.join(' '));

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v22.0';

    if (!phoneNumberId || !accessToken) {
      return {
        success: false,
        error: 'No WhatsApp API credentials configured in environment variables.',
        waLink,
      };
    }

    const effectiveButtonPayloads =
      buttonPayloads && buttonPayloads.length > 0
        ? buttonPayloads
        : template === 'schichtplan_benachrichtigung'
          ? ['CONFIRM', 'SICK', 'CUSTOM']
          : undefined;

    const buildPayload = (lang: string, includeButtons: boolean) => {
      const p: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanedPhone,
        type: 'template',
        template: {
          name: template,
          language: {
            code: lang,
          },
        },
      };

      const components: any[] = [];

      if (parameters && parameters.length > 0) {
        components.push({
          type: 'body',
          parameters: parameters.map((param) => ({
            type: 'text',
            text: String(param || '')
              .replace(/[\r\n\t]+/g, ' ')
              .replace(/\s{2,}/g, ' ')
              .trim()
              .substring(0, 1000),
          })),
        });
      }

      if (includeButtons && effectiveButtonPayloads && effectiveButtonPayloads.length > 0) {
        effectiveButtonPayloads.forEach((payloadVal, idx) => {
          components.push({
            type: 'button',
            sub_type: 'quick_reply',
            index: String(idx),
            parameters: [
              {
                type: 'payload',
                payload: payloadVal,
              },
            ],
          });
        });
      }

      if (components.length > 0) {
        p.template.components = components;
      }

      return p;
    };

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    // Internal helper to make the request to Meta API
    const postToMeta = async (reqPayload: any) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reqPayload),
      });
      const resData = await response.json();
      return { ok: response.ok, status: response.status, resData };
    };

    try {
      // Attempt 1: With buttons (if available) and requested language code
      const hasButtons = Boolean(effectiveButtonPayloads && effectiveButtonPayloads.length > 0);
      let payload = buildPayload(languageCode, hasButtons);
      let { ok, resData } = await postToMeta(payload);

      if (ok) {
        this.logger.log(
          `WhatsApp template message (${template}) successfully sent to +${cleanedPhone}`,
        );
        return { success: true, data: resData, waLink };
      }

      const errorCode = resData.error?.code;
      const errorMsg = resData.error?.message || 'Meta API rejected template message';
      this.logger.warn(
        `Failed sending WhatsApp template (${template}) to +${cleanedPhone}: [${errorCode}] ${errorMsg}`,
      );

      // Attempt 2: If language translation not found (e.g. 132001), try alternate German code ('de_DE' vs 'de')
      if (errorCode === 132001 || errorMsg.includes('translation') || errorMsg.includes('language')) {
        const altLang = languageCode === 'de' ? 'de_DE' : 'de';
        this.logger.log(`Retrying template (${template}) with alternative language code '${altLang}'...`);
        const altPayload = buildPayload(altLang, hasButtons);
        const retryResult = await postToMeta(altPayload);
        if (retryResult.ok) {
          this.logger.log(
            `WhatsApp template message (${template}) successfully sent with lang '${altLang}' to +${cleanedPhone}`,
          );
          return { success: true, data: retryResult.resData, waLink };
        }
      }

      // Attempt 3: If buttons mismatch (e.g. 132000), retry WITHOUT buttons in case template has no buttons in Meta
      if (hasButtons && (errorCode === 132000 || errorMsg.includes('parameter') || errorMsg.includes('button'))) {
        this.logger.log(`Retrying template (${template}) without button components...`);
        const noButtonsPayload = buildPayload(languageCode, false);
        const retryNoButtons = await postToMeta(noButtonsPayload);
        if (retryNoButtons.ok) {
          this.logger.log(
            `WhatsApp template message (${template}) sent without buttons to +${cleanedPhone}`,
          );
          return { success: true, data: retryNoButtons.resData, waLink };
        }
      }

      return { success: false, error: errorMsg, waLink, data: resData };
    } catch (err: any) {
      this.logger.error(`Error sending WhatsApp template (${template}): ${err.message}`);
      return { success: false, error: err.message, waLink };
    }
  }

  /**
   * Send WhatsApp template to multiple recipients in parallel batches.
   */
  async sendWhatsAppTemplateBulk(
    recipients: Array<{ phone: string; name?: string; parameters?: string[] }>,
    templateName?: string,
    languageCode = 'de',
    concurrency = 5,
  ): Promise<{
    success: boolean;
    results: Array<{ phone: string; success: boolean; waLink?: string; error?: string; data?: any }>;
  }> {
    const results: Array<{
      phone: string;
      success: boolean;
      waLink?: string;
      error?: string;
      data?: any;
    }> = [];

    for (let i = 0; i < recipients.length; i += concurrency) {
      const batch = recipients.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((rec) =>
          this.sendWhatsAppTemplate(
            rec.phone,
            templateName,
            rec.parameters || [rec.name || 'Mitarbeiter', 'Neue Schichteinteilung'],
            languageCode,
          ).then((res) => ({ phone: rec.phone, ...res })),
        ),
      );
      results.push(...batchResults);
    }

    return {
      success: results.every((r) => r.success),
      results,
    };
  }

  /**
   * Diagnostic check of the Meta WhatsApp Cloud API credentials
   */
  async checkConnection(): Promise<{
    configured: boolean;
    phoneNumberId?: string;
    tokenMasked?: string;
    metaResponse?: any;
    error?: string;
    status?: string;
  }> {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v22.0';

    if (!phoneNumberId || !accessToken) {
      return {
        configured: false,
        error: 'Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN in environment variables',
      };
    }

    const tokenMasked = `${accessToken.substring(0, 8)}...${accessToken.slice(-6)}`;

    try {
      const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=verified_name,code_verification_status,display_phone_number,quality_rating,platform_type&access_token=${accessToken}`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        return {
          configured: true,
          status: 'CONNECTED',
          phoneNumberId,
          tokenMasked,
          metaResponse: data,
        };
      } else {
        return {
          configured: true,
          status: 'FAILED',
          phoneNumberId,
          tokenMasked,
          metaResponse: data,
          error: data.error?.message || 'Meta API returned an error',
        };
      }
    } catch (err: any) {
      return {
        configured: true,
        status: 'NETWORK_ERROR',
        phoneNumberId,
        tokenMasked,
        error: err.message,
      };
    }
  }

  /**
   * Ensure WhatsApp Business Account (WABA) has this app subscribed in subscribed_apps.
   * Required by Meta Cloud API so incoming button clicks and messages are forwarded to the webhook.
   */
  async syncWabaWebhookSubscription(overrideWabaId?: string): Promise<{
    success: boolean;
    wabaId?: string;
    subscribeResult?: any;
    subscribedApps?: any;
    debugTokenData?: any;
    error?: string;
  }> {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v22.0';

    if (!phoneNumberId || !accessToken) {
      return {
        success: false,
        error: 'Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN',
      };
    }

    try {
      // 1. Resolve WABA ID from parameter, env, or default verified WABA ID 4587108911610044
      let wabaId =
        overrideWabaId ||
        process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
        '4587108911610044';
      let debugTokenData: any = null;

      if (!wabaId) {
        try {
          const debugUrl = `https://graph.facebook.com/${apiVersion}/debug_token?input_token=${accessToken}&access_token=${accessToken}`;
          const debugRes = await fetch(debugUrl);
          debugTokenData = await debugRes.json();
          const scopes = debugTokenData.data?.granular_scopes || [];
          for (const s of scopes) {
            if (
              (s.scope === 'whatsapp_business_messaging' || s.scope === 'whatsapp_business_management') &&
              Array.isArray(s.target_ids) &&
              s.target_ids.length > 0
            ) {
              wabaId = s.target_ids[0];
              break;
            }
          }
        } catch (e: any) {
          this.logger.warn(`Could not fetch debug_token: ${e.message}`);
        }
      }

      if (!wabaId) {
        // Try querying /me/businesses
        try {
          const bizUrl = `https://graph.facebook.com/${apiVersion}/me/businesses?access_token=${accessToken}`;
          const bizRes = await fetch(bizUrl);
          const bizData = await bizRes.json();
          debugTokenData = { ...debugTokenData, bizData };
          if (Array.isArray(bizData.data)) {
            for (const biz of bizData.data) {
              const wabaUrl = `https://graph.facebook.com/${apiVersion}/${biz.id}/whatsapp_business_accounts?access_token=${accessToken}`;
              const wabaRes = await fetch(wabaUrl);
              const wabaData = await wabaRes.json();
              debugTokenData = { ...debugTokenData, [`biz_${biz.id}_waba`]: wabaData };
              if (Array.isArray(wabaData.data) && wabaData.data.length > 0) {
                wabaId = wabaData.data[0].id;
                break;
              }
            }
          }
        } catch (e: any) {
          this.logger.warn(`Could not fetch /me/businesses: ${e.message}`);
        }
      }

      if (!wabaId) {
        // Try querying known verified business 3755132271451406
        try {
          const knownBizUrl = `https://graph.facebook.com/${apiVersion}/3755132271451406/whatsapp_business_accounts?access_token=${accessToken}`;
          const knownBizRes = await fetch(knownBizUrl);
          const knownBizData = await knownBizRes.json();
          debugTokenData = { ...debugTokenData, knownBizData };
          if (Array.isArray(knownBizData.data) && knownBizData.data.length > 0) {
            wabaId = knownBizData.data[0].id;
          }
        } catch (e: any) {
          this.logger.warn(`Could not query business 3755132271451406: ${e.message}`);
        }
      }

      if (!wabaId) {
        // Try querying app's whatsapp_business_accounts
        try {
          const appId = debugTokenData?.data?.app_id || '1723882768723349';
          const appWabaUrl = `https://graph.facebook.com/${apiVersion}/${appId}/whatsapp_business_accounts?access_token=${accessToken}`;
          const appWabaRes = await fetch(appWabaUrl);
          const appWabaData = await appWabaRes.json();
          debugTokenData = { ...debugTokenData, appWabaData };
          if (Array.isArray(appWabaData.data) && appWabaData.data.length > 0) {
            wabaId = appWabaData.data[0].id;
          }
        } catch (e: any) {}
      }

      if (!wabaId) {
        return {
          success: false,
          error: 'Could not auto-discover WABA ID from businesses or app',
          debugTokenData,
        };
      }

      // 2. Subscribe app to WABA
      const subUrl = `https://graph.facebook.com/${apiVersion}/${wabaId}/subscribed_apps`;
      const postRes = await fetch(subUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      const postData = await postRes.json();

      // 3. Verify subscribed apps
      const getRes = await fetch(subUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const getData = await getRes.json();

      this.logger.log(
        `[WhatsApp WABA Subscription] WABA ID: ${wabaId} | Post: ${JSON.stringify(postData)} | Get: ${JSON.stringify(getData)}`,
      );

      return {
        success: postData.success === true || (Array.isArray(getData.data) && getData.data.length > 0),
        wabaId,
        subscribeResult: postData,
        subscribedApps: getData,
        debugTokenData,
      };
    } catch (err: any) {
      this.logger.error(`[WhatsApp WABA Subscription] Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}


