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
              this.logger.error(
                `[WhatsApp Webhook] Delivery Error: ${JSON.stringify(status.errors)}`,
              );
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
    } else if (msg.type === 'text' && msg.text?.body) {
      const incomingText = msg.text.body.trim();
      this.logger.log(`[WhatsApp Webhook] Received text from +${cleanFrom}: "${incomingText}"`);

      // Match user by normalized phone ending (handles leading zeros vs +49)
      const phoneDigits = cleanFrom.slice(-9);
      const user = await this.prisma.user.findFirst({
        where: {
          phone: { contains: phoneDigits },
          isActive: true,
          deletedAt: null,
        },
      });

      if (user) {
        // Find their nearest active/upcoming shift assignment
        const recentAssignment = await this.prisma.planEmployee.findFirst({
          where: {
            employeeId: user.id,
            plan: { deletedAt: null },
          },
          orderBy: { plan: { date: 'desc' } },
          include: { plan: true },
        });

        if (recentAssignment) {
          const currentStatus = recentAssignment.confirmationStatus === 'PENDING'
            ? 'CUSTOM_RESPONSE'
            : recentAssignment.confirmationStatus;

          await this.prisma.planEmployee.update({
            where: {
              planId_employeeId: {
                planId: recentAssignment.planId,
                employeeId: user.id,
              },
            },
            data: {
              confirmationStatus: currentStatus,
              responseNote: incomingText,
              respondedAt: new Date(),
              responseChannel: 'WHATSAPP_TEXT',
            },
          });

          await this.prisma.actionLog.create({
            data: {
              userId: user.id,
              action: 'WHATSAPP_NOTE_RECEIVED',
              details: `Mitarbeiter "${user.name}" hat Notiz übermittelt: "${incomingText}"`,
            },
          }).catch(() => {});

          const formattedPlanDate = new Date(recentAssignment.plan.date).toLocaleDateString('de-DE');
          await this.sendWhatsAppDirect(
            cleanFrom,
            `👍 Vielen Dank, ${user.name}! Ihre Nachricht („${incomingText}“) wurde für Ihren Schichteinsatz am ${formattedPlanDate} vermerkt.`,
          ).catch(() => {});
        }
      }
    }
  }

  /**
   * Send an interactive WhatsApp message with quick-reply buttons (Meta Cloud API).
   * Up to 3 buttons allowed by Meta.
   */
  async sendWhatsAppInteractive(
    phone: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    headerText?: string,
    footerText?: string,
  ): Promise<{ success: boolean; data?: any; error?: string; waLink?: string }> {
    const cleanedPhone = this.formatPhoneNumber(phone);
    const waLink = this.generateWhatsAppLink(phone, bodyText);

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

    // Limit to max 3 buttons per WhatsApp Cloud API specification
    const validButtons = (buttons || []).slice(0, 3).map((btn, idx) => ({
      type: 'reply',
      reply: {
        id: (btn.id || `btn_${idx}`).substring(0, 256),
        title: (btn.title || `Button ${idx + 1}`).substring(0, 20),
      },
    }));

    if (validButtons.length === 0) {
      return this.sendWhatsAppDirect(phone, bodyText);
    }

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

        // Fallback: If 24-hour window is closed (Meta Error 131047 / re-engagement), try approved template
        if (
          resData.error?.code === 131047 ||
          errorMsg.includes('24 hours') ||
          errorMsg.includes('re-engagement')
        ) {
          this.logger.log(
            `24h window closed for +${cleanedPhone}. Attempting approved template fallback...`,
          );
          return this.sendWhatsAppTemplate(phone, undefined, [
            headerText || 'Mitarbeiter',
            bodyText.substring(0, 120),
          ]);
        }

        return { success: false, error: errorMsg, waLink };
      }
    } catch (err: any) {
      this.logger.error(`Error sending interactive WhatsApp message: ${err.message}`);
      return { success: false, error: err.message, waLink };
    }
  }

  /**
   * Send an approved WhatsApp Message Template (Meta Cloud API).
   * Works outside the 24-hour customer service window for any recipient.
   */
  async sendWhatsAppTemplate(
    phone: string,
    templateName?: string,
    parameters: string[] = [],
    languageCode = 'de',
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

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanedPhone,
      type: 'template',
      template: {
        name: template,
        language: {
          code: languageCode,
        },
      },
    };

    if (parameters && parameters.length > 0) {
      payload.template.components = [
        {
          type: 'body',
          parameters: parameters.map((param) => ({
            type: 'text',
            text: String(param),
          })),
        },
      ];
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const resData = await response.json();

      if (response.ok) {
        this.logger.log(
          `WhatsApp template message (${template}) successfully sent to +${cleanedPhone}`,
        );
        return { success: true, data: resData, waLink };
      } else {
        const errorMsg = resData.error?.message || 'Meta API rejected template message';
        this.logger.warn(
          `Failed sending WhatsApp template (${template}) to +${cleanedPhone}: ${errorMsg}`,
        );
        return { success: false, error: errorMsg, waLink, data: resData };
      }
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


