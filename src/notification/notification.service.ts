import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { userId?: string; title: string; message: string; type: string }) {
    return this.prisma.notification.create({
      data: {
        userId: data.userId || null,
        title: data.title,
        message: data.message,
        type: data.type,
      },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: {
        OR: [
          { userId },
          { userId: null }, // System alerts visible to all
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    // Only allow updating if it belongs to the user or is a general notification
    if (notification.userId && notification.userId !== userId) {
      throw new NotFoundException(`Notification not found or access denied`);
    }

    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        OR: [
          { userId },
          { userId: null },
        ],
        read: false,
      },
      data: { read: true },
    });
  }
}
