import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(private readonly prisma: PrismaService) {}

  generateWhatsAppLink(phone: string, message: string): string {
    const cleanedPhone = phone.replace(/\D/g, '');
    return `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`;
  }

  async sendWhatsAppDirect(phone: string, message: string): Promise<{ success: boolean; data?: any; error?: string }> {
    const cleanedPhone = phone.replace(/\D/g, '');
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      this.logger.error('WhatsApp credentials (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN) are missing in environment variables.');
      return { success: false, error: 'WhatsApp credentials missing' };
    }

    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

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

      if (!response.ok) {
        this.logger.error(`WhatsApp API error: ${JSON.stringify(resData)}`);
        return { success: false, error: resData?.error?.message || 'Meta API call failed', data: resData };
      }

      this.logger.log(`WhatsApp message successfully sent to ${cleanedPhone}`);
      return { success: true, data: resData };
    } catch (err: any) {
      this.logger.error(`Error sending WhatsApp message: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async sendSMS(phone: string, message: string): Promise<boolean> {
    this.logger.log(`[SMS Simulation] Sending to ${phone}: "${message}"`);
    return true;
  }

  async broadcastMessage(type: 'sms' | 'whatsapp', userIds: string[], message: string): Promise<{ success: boolean; links?: string[]; results?: any }> {
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        isActive: true,
      },
    });

    if (type === 'sms') {
      let allSuccess = true;
      for (const user of users) {
        const result = await this.sendSMS(user.phone, message);
        if (!result) allSuccess = false;
      }
      return { success: allSuccess };
    } else {
      const results = [];
      for (const user of users) {
        const res = await this.sendWhatsAppDirect(user.phone, message);
        results.push({ user: user.phone, ...res });
      }
      return { success: results.every(r => r.success), results };
    }
  }
}
