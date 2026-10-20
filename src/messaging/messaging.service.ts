import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(private readonly prisma: PrismaService) {}

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
   * Process Meta WhatsApp Cloud API webhook events
   */
  async handleWebhookPayload(body: any): Promise<void> {
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
            try {
              await this.processIncomingWebhookMessage(msg);
            } catch (err: any) {
              this.logger.error(`Error processing incoming WhatsApp message from ${msg.from}: ${err.message}`);
            }
          }
        }
      }
    }
  }

  /**
   * Process individual incoming message (Interactive button reply or custom text).
   * Synchronizes PlanEmployee confirmation status and EmployeeAbsence records.
   */
  private async processIncomingWebhookMessage(msg: any): Promise<void> {
    const rawFrom = String(msg.from || '');
    const cleanFrom = this.formatPhoneNumber(rawFrom);

    if (msg.type === 'interactive' && msg.interactive?.button_reply) {
      const reply = msg.interactive.button_reply;
      const buttonId: string = reply.id || '';
      const buttonTitle: string = reply.title || '';

      this.logger.log(
        `[WhatsApp Webhook] 🔘 User clicked button: "${buttonTitle}" (ID: ${buttonId}) from +${cleanFrom}`,
      );

      // Expected ID formats:
      // CONFIRM_{planId}_{employeeId} or accept_{planId}_{employeeId}
      // SICK_{planId}_{employeeId} or decline_{planId}_{employeeId}
      // CUSTOM_{planId}_{employeeId}
      const parts = buttonId.split('_');
      if (parts.length >= 3) {
        const actionPrefix = parts[0].toUpperCase();
        const planId = parts[1];
        const employeeId = parts.slice(2).join('_'); // support uuid with dashes

        if (actionPrefix === 'CONFIRM' || actionPrefix === 'ACCEPT') {
          // 1. Employee confirmed: "Ich bin da"
          await this.prisma.planEmployee.updateMany({
            where: { planId, employeeId },
            data: {
              confirmationStatus: 'CONFIRMED',
              responseNote: 'Zugesagt („Ich bin da“)',
              respondedAt: new Date(),
              responseChannel: 'WHATSAPP_BUTTON',
            },
          });

          await this.prisma.actionLog.create({
            data: {
              userId: employeeId,
              action: 'WHATSAPP_CONFIRMED',
              details: `Mitarbeiter hat Schicht zugesagt („Ich bin da“) via WhatsApp-Button`,
            },
          }).catch(() => {});

          await this.sendWhatsAppDirect(
            cleanFrom,
            `✅ Vielen Dank! Ihre Zusage („Ich bin da“) wurde erfolgreich gespeichert. Wir freuen uns auf Ihren Einsatz!`,
          ).catch(() => {});

        } else if (actionPrefix === 'SICK' || actionPrefix === 'DECLINE') {
          // 2. Employee reported sick: "Ich bin krank"
          await this.prisma.planEmployee.updateMany({
            where: { planId, employeeId },
            data: {
              confirmationStatus: 'SICK',
              responseNote: 'Krankmeldung via WhatsApp („Ich bin krank“)',
              respondedAt: new Date(),
              responseChannel: 'WHATSAPP_BUTTON',
            },
          });

          // Sync with EmployeeAbsence
          const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
          if (plan) {
            const normDate = new Date(plan.date);
            normDate.setUTCHours(0, 0, 0, 0);
            await this.prisma.employeeAbsence.upsert({
              where: {
                employeeId_date: {
                  employeeId,
                  date: normDate,
                },
              },
              create: {
                employeeId,
                date: normDate,
                status: 'KRANK',
                reason: 'Krankmeldung via WhatsApp-Button („Ich bin krank“)',
              },
              update: {
                status: 'KRANK',
                reason: 'Krankmeldung via WhatsApp-Button („Ich bin krank“)',
              },
            }).catch(() => {});
          }

          await this.prisma.actionLog.create({
            data: {
              userId: employeeId,
              action: 'WHATSAPP_SICK_REPORT',
              details: `Mitarbeiter hat sich krank gemeldet („Ich bin krank“) via WhatsApp-Button`,
            },
          }).catch(() => {});

          await this.sendWhatsAppDirect(
            cleanFrom,
            `🤒 Ihre Krankmeldung wurde erfasst und an die Schichtleitung übermittelt. Gute Besserung!`,
          ).catch(() => {});

        } else if (actionPrefix === 'CUSTOM') {
          // 3. Employee chose "Custom Nachricht"
          await this.prisma.planEmployee.updateMany({
            where: { planId, employeeId },
            data: {
              confirmationStatus: 'CUSTOM_RESPONSE',
              responseNote: 'Wartet auf individuelle Textnachricht',
              respondedAt: new Date(),
              responseChannel: 'WHATSAPP_BUTTON',
            },
          });

          await this.sendWhatsAppDirect(
            cleanFrom,
            `💬 Bitte schreiben Sie uns direkt hier im Chat eine kurze Nachricht (z. B. Grund der Verhinderung oder wann Sie kommen können).`,
          ).catch(() => {});
        }
      }
    } else if (
      (msg.type === 'text' && msg.text?.body) ||
      (msg.type === 'button' && (msg.button?.text || msg.button?.payload))
    ) {
      const incomingText = (msg.button?.payload || msg.button?.text || msg.text?.body || '').trim();
      this.logger.log(`[WhatsApp Webhook] Received ${msg.type} from +${cleanFrom}: "${incomingText}"`);

      // Robust phone matching across variations (+49..., 0176..., 49..., or last 8-9 digits)
      const last9 = cleanFrom.slice(-9); // "663477268"
      const last8 = cleanFrom.slice(-8); // "63477268"
      const germanLocal = '0' + cleanFrom.substring(2); // "017663477268"
      const international = '+' + cleanFrom; // "+4917663477268"

      const user = await this.prisma.user.findFirst({
        where: {
          isActive: true,
          deletedAt: null,
          OR: [
            { phone: cleanFrom },
            { phone: germanLocal },
            { phone: international },
            { phone: { contains: last9 } },
            { phone: { contains: last8 } },
          ],
        },
      });

      if (!user) {
        this.logger.warn(`[WhatsApp Webhook] No active user found for phone +${cleanFrom}`);
        await this.prisma.actionLog.create({
          data: {
            action: 'WHATSAPP_UNKNOWN_SENDER',
            details: `WhatsApp-Nachricht von unbekannter Nummer +${cleanFrom} erhalten: "${incomingText}"`,
          },
        }).catch(() => {});
        return;
      }

      // Prioritize PENDING shift assignment for today or upcoming dates
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      let recentAssignment = await this.prisma.planEmployee.findFirst({
        where: {
          employeeId: user.id,
          plan: {
            date: { gte: todayStart },
            deletedAt: null,
          },
          confirmationStatus: 'PENDING',
        },
        orderBy: { plan: { date: 'asc' } },
        include: { plan: true },
      });

      if (!recentAssignment) {
        // Fallback: Most recent plan assignment overall
        recentAssignment = await this.prisma.planEmployee.findFirst({
          where: {
            employeeId: user.id,
            plan: { deletedAt: null },
          },
          orderBy: { plan: { date: 'desc' } },
          include: { plan: true },
        });
      }

      if (recentAssignment) {
        const lower = incomingText.toLowerCase();
        let targetStatus: 'CONFIRMED' | 'SICK' | 'CUSTOM_RESPONSE' = 'CUSTOM_RESPONSE';
        let noteText = incomingText;

        if (lower === '1' || lower.includes('bin da') || lower.includes('komme') || lower === 'ja') {
          targetStatus = 'CONFIRMED';
          noteText = `Zugesagt („${incomingText}“)`;
        } else if (lower === '2' || lower.includes('krank') || lower.includes('arzt')) {
          targetStatus = 'SICK';
          noteText = `Krankmeldung via Text („${incomingText}“)`;

          // Sync with EmployeeAbsence
          const normDate = new Date(recentAssignment.plan.date);
          normDate.setUTCHours(0, 0, 0, 0);
          await this.prisma.employeeAbsence.upsert({
            where: {
              employeeId_date: {
                employeeId: user.id,
                date: normDate,
              },
            },
            create: {
              employeeId: user.id,
              date: normDate,
              status: 'KRANK',
              reason: noteText,
            },
            update: {
              status: 'KRANK',
              reason: noteText,
            },
          }).catch(() => {});
        } else if (lower === '3' || lower.startsWith('3') || lower.includes('nachricht')) {
          targetStatus = 'CUSTOM_RESPONSE';
          noteText = incomingText.length > 2 ? incomingText : 'Mitarbeiter wünscht Rücksprache (Option 3)';
        } else {
          // Any other response (e.g. "5", "komme 10 min später", etc.)
          targetStatus = 'CUSTOM_RESPONSE';
          noteText = incomingText;
        }

        await this.prisma.planEmployee.update({
          where: {
            planId_employeeId: {
              planId: recentAssignment.planId,
              employeeId: user.id,
            },
          },
          data: {
            confirmationStatus: targetStatus,
            responseNote: noteText,
            respondedAt: new Date(),
            responseChannel: 'WHATSAPP_TEXT',
          },
        });

        await this.prisma.actionLog.create({
          data: {
            userId: user.id,
            action: targetStatus === 'CONFIRMED'
              ? 'WHATSAPP_CONFIRMED'
              : targetStatus === 'SICK'
              ? 'WHATSAPP_SICK_REPORT'
              : 'WHATSAPP_NOTE_RECEIVED',
            details: `Mitarbeiter "${user.name}" (${user.phone}) Rückmeldung per Text: "${incomingText}" (${targetStatus})`,
          },
        }).catch(() => {});

        const formattedPlanDate = new Date(recentAssignment.plan.date).toLocaleDateString('de-DE');
        const replyAck = targetStatus === 'CONFIRMED'
          ? `✅ Vielen Dank, ${user.name}! Ihre Zusage („Ich bin da“) wurde für Ihren Schichteinsatz am ${formattedPlanDate} gespeichert.`
          : targetStatus === 'SICK'
          ? `🤒 Ihre Krankmeldung wurde erfasst und an die Schichtleitung übermittelt. Gute Besserung!`
          : `👍 Vielen Dank, ${user.name}! Ihre Nachricht („${incomingText}“) wurde für Ihren Schichteinsatz am ${formattedPlanDate} vermerkt.`;

        await this.sendWhatsAppDirect(cleanFrom, replyAck).catch(() => {});
      } else {
        this.logger.warn(`[WhatsApp Webhook] No plan assignment found for user ${user.name} (+${cleanFrom})`);
      }
    }
  }

  /**
   * Diagnostic helper: Simulates an incoming WhatsApp message as if received by Meta webhook
   */
  async simulateIncomingMessage(phone: string, text: string): Promise<{ success: boolean; message: string }> {
    const fakeMsg = {
      from: this.formatPhoneNumber(phone),
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
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'logiflow_whatsapp_verify_2026';
    const callbackUrl = 'https://warehause-test.onrender.com/messaging/webhook';
    return {
      callbackUrl,
      verifyToken,
      requiredWebhookField: 'messages',
      instructions: 'In der Meta Developer Console (developers.facebook.com): App -> WhatsApp -> Konfiguration -> Webhook-Felder -> Verwalten -> "messages" abonnieren.',
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
        `Einsatzort: ${warehouseName}, Halle: ${hallName} | Treffpunkt: ${treffpunktInfo} | Datum: ${dateFormatted} (${shiftTime}) | Optionen: 1=Ich bin da, 2=Krank, 3=Nachricht`
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim()
          .substring(0, 200);

      // Strategy 1: Attempt Interactive Buttons with Quick-Reply options first.
      // If the 24-hour window is active (e.g. employee chatted or replied), Meta delivers
      // real clickable buttons ([✅ Ich bin da] [🤒 Ich bin krank] [💬 Custom Nachricht]) directly in WhatsApp.
      this.logger.log(`Attempting Meta interactive button message for +${cleanedPhone}...`);
      const interactiveRes = await this.sendWhatsAppInteractive(
        phone,
        fullBodyText,
        buttons,
        headerTitle || 'LogiFlow Schichtplan',
        'LogiFlow Warehouse',
      );

      if (interactiveRes.success) {
        this.logger.log(`✓ Meta interactive buttons delivered to +${cleanedPhone}`);
        return { success: true, method: 'META_INTERACTIVE', waLink, data: interactiveRes.data };
      }

      this.logger.log(
        `Interactive button delivery not accepted (+${cleanedPhone}: ${interactiveRes.error}). Falling back to approved Meta template...`,
      );

      // Strategy 2: Approved Meta Template (guaranteed delivery outside 24-hour customer window)
      const templateButtonPayloads = [
        `CONFIRM_${planId}_${employeeId}`,
        `SICK_${planId}_${employeeId}`,
        `CUSTOM_${planId}_${employeeId}`,
      ];

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
}


