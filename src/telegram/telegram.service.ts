import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
  }

  async sendMessage(chatId: string, text: string): Promise<boolean> {
    if (!chatId) {
      this.logger.warn('Skipping message: No chatId provided');
      return false;
    }

    if (!this.botToken) {
      this.logger.log(`[TELEGRAM MOCK - CHAT: ${chatId}]:\n${text}`);
      return true;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Telegram Bot API error for chat ${chatId}: ${errorText}`);
        return false;
      }

      return true;
    } catch (err: any) {
      this.logger.error(`Failed to send Telegram message to ${chatId}: ${err.message}`);
      return false;
    }
  }

  async sendDailySchedule(employeeId: string, plan: { date: Date; warehouseName: string; hallName: string }) {
    const user = await this.prisma.user.findFirst({
      where: { id: employeeId, deletedAt: null },
    });

    if (!user || !user.telegramId) {
      this.logger.warn(`Could not send daily schedule: User ${employeeId} has no telegramId or does not exist`);
      return false;
    }

    const dateStr = plan.date.toISOString().split('T')[0];
    const message = `📋 <b>Daily Schedule Update</b>\n\n` +
      `<b>Date:</b> ${dateStr}\n` +
      `<b>Warehouse:</b> ${plan.warehouseName}\n` +
      `<b>Hall:</b> ${plan.hallName}\n\n` +
      `Please report to your assigned location on time.`;

    return this.sendMessage(user.telegramId, message);
  }

  async sendEmergencyMessage(warehouseId: string, message: string) {
    // Find all active employees in this warehouse
    const employees = await this.prisma.user.findMany({
      where: {
        warehouseId,
        isActive: true,
        deletedAt: null,
        telegramId: { not: null },
      },
    });

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });

    const whName = warehouse ? warehouse.name : 'your assigned warehouse';
    const alertMessage = `⚠️ <b>EMERGENCY ALERT - ${whName.toUpperCase()}</b>\n\n` +
      `${message}\n\n` +
      `Please follow all safety protocols immediately.`;

    let successCount = 0;
    for (const emp of employees) {
      if (emp.telegramId) {
        const sent = await this.sendMessage(emp.telegramId, alertMessage);
        if (sent) successCount++;
      }
    }

    this.logger.log(`Sent emergency alert to ${successCount}/${employees.length} employees at warehouse ${warehouseId}`);
    return { successCount, totalCount: employees.length };
  }

  async sendAttendanceReminder(employeeId: string, message: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: employeeId, deletedAt: null },
    });

    if (!user || !user.telegramId) {
      this.logger.warn(`Could not send attendance reminder: User ${employeeId} has no telegramId`);
      return false;
    }

    const reminderMessage = `⏰ <b>Attendance Reminder</b>\n\n` +
      `${message}\n\n` +
      `Make sure to clock in/out using the terminal or app.`;

    return this.sendMessage(user.telegramId, reminderMessage);
  }

  async broadcastMessage(message: string) {
    // Find all active users with a telegram ID
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        telegramId: { not: null },
      },
    });

    const broadcastText = `📢 <b>SYSTEM BROADCAST</b>\n\n` +
      `${message}`;

    let successCount = 0;
    for (const u of users) {
      if (u.telegramId) {
        const sent = await this.sendMessage(u.telegramId, broadcastText);
        if (sent) successCount++;
      }
    }

    this.logger.log(`Broadcasted message to ${successCount}/${users.length} users`);
    return { successCount, totalCount: users.length };
  }
}
