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
  handleWebhookPayload(body: any): void {
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

        // Log incoming messages from employees/users
        if (value.messages && Array.isArray(value.messages)) {
          for (const msg of value.messages) {
            this.logger.log(
              `[WhatsApp Webhook] Received message from ${msg.from}: ${msg.text?.body || msg.type}`,
            );
          }
        }
      }
    }
  }
}

