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

  async sendSMS(phone: string, message: string): Promise<boolean> {
    this.logger.log(`[SMS Simulation] Sending to ${phone}: "${message}"`);
    // Placeholder for Twilio, Vonage, or local gateway integration
    return true;
  }

  async broadcastMessage(type: 'sms' | 'whatsapp', userIds: string[], message: string): Promise<{ success: boolean; links?: string[] }> {
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
      const links = users.map(user => this.generateWhatsAppLink(user.phone, message));
      return { success: true, links };
    }
  }
}
