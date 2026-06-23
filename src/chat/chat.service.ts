import { Injectable, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async sendMessage(senderId: string, receiverId: string, content: string) {
    if (!content || content.trim() === '') {
      throw new BadRequestException('Nachrichteninhalt darf nicht leer sein.');
    }

    // Get sender details
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
    });

    if (!sender) {
      throw new NotFoundException('Absender nicht gefunden.');
    }

    // Get receiver details
    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
    });

    if (!receiver) {
      throw new NotFoundException('Empfänger nicht gefunden.');
    }

    // Block logic: If employee is blocked, deny all messages sent by them
    if (sender.role === Role.EMPLOYEE && sender.isChatBlocked) {
      throw new ForbiddenException('Sie wurden von der Chat-Kommunikation ausgeschlossen.');
    }

    // Role restrictions:
    // Employees can only message Managers and Admins
    if (sender.role === Role.EMPLOYEE && receiver.role === Role.EMPLOYEE) {
      throw new ForbiddenException('Mitarbeiter können nur mit Managern und Admins chatten.');
    }

    // Throttling: Employees can only send one message to a Manager/Admin until they reply
    if (sender.role === Role.EMPLOYEE && (receiver.role === Role.MANAGER || receiver.role === Role.ADMIN)) {
      const lastMessage = await this.prisma.chatMessage.findFirst({
        where: {
          OR: [
            { senderId: senderId, receiverId: receiverId },
            { senderId: receiverId, receiverId: senderId },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      if (lastMessage && lastMessage.senderId === senderId) {
        throw new BadRequestException(
          'Sie können erst wieder eine Nachricht senden, wenn der Manager oder Admin auf Ihre vorherige Nachricht geantwortet hat.'
        );
      }
    }

    // Save the message
    const message = await this.prisma.chatMessage.create({
      data: {
        senderId,
        receiverId,
        content: content.trim(),
      },
      include: {
        sender: { select: { id: true, name: true, role: true } },
        receiver: { select: { id: true, name: true, role: true } },
      },
    });

    return message;
  }

  async getHistory(userId1: string, userId2: string) {
    // Retrieve conversation history
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: userId1, receiverId: userId2 },
          { senderId: userId2, receiverId: userId1 },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, role: true } },
        receiver: { select: { id: true, name: true, role: true } },
      },
    });

    // Mark messages sent by userId2 to userId1 as read
    await this.prisma.chatMessage.updateMany({
      where: {
        senderId: userId2,
        receiverId: userId1,
        read: false,
      },
      data: { read: true },
    });

    return messages;
  }

  async getConversations(userId: string, role: Role) {
    if (role === Role.MANAGER || role === Role.ADMIN) {
      // Admins/Managers see all active employees
      const employees = await this.prisma.user.findMany({
        where: {
          role: Role.EMPLOYEE,
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          isChatBlocked: true,
        },
        orderBy: { name: 'asc' },
      });

      const conversationList = [];

      for (const emp of employees) {
        // Find last message
        const lastMessage = await this.prisma.chatMessage.findFirst({
          where: {
            OR: [
              { senderId: userId, receiverId: emp.id },
              { senderId: emp.id, receiverId: userId },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });

        // Count unread messages from this employee to the manager
        const unreadCount = await this.prisma.chatMessage.count({
          where: {
            senderId: emp.id,
            receiverId: userId,
            read: false,
          },
        });

        conversationList.push({
          id: emp.id,
          name: emp.name,
          username: emp.username,
          role: emp.role,
          isChatBlocked: emp.isChatBlocked,
          lastMessage: lastMessage ? {
            id: lastMessage.id,
            content: lastMessage.content,
            createdAt: lastMessage.createdAt,
            senderId: lastMessage.senderId,
          } : null,
          unreadCount,
        });
      }

      return conversationList;
    } else {
      // Employees see all active managers and admins
      const managers = await this.prisma.user.findMany({
        where: {
          role: { in: [Role.MANAGER, Role.ADMIN] },
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
        },
        orderBy: { name: 'asc' },
      });

      const conversationList = [];

      for (const mgr of managers) {
        const lastMessage = await this.prisma.chatMessage.findFirst({
          where: {
            OR: [
              { senderId: userId, receiverId: mgr.id },
              { senderId: mgr.id, receiverId: userId },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });

        const unreadCount = await this.prisma.chatMessage.count({
          where: {
            senderId: mgr.id,
            receiverId: userId,
            read: false,
          },
        });

        conversationList.push({
          id: mgr.id,
          name: mgr.name,
          username: mgr.username,
          role: mgr.role,
          isChatBlocked: false, // Managers cannot be blocked by employees
          lastMessage: lastMessage ? {
            id: lastMessage.id,
            content: lastMessage.content,
            createdAt: lastMessage.createdAt,
            senderId: lastMessage.senderId,
          } : null,
          unreadCount,
        });
      }

      return conversationList;
    }
  }

  async setBlockStatus(employeeId: string, isBlocked: boolean, actorId: string, actorRole: Role) {
    if (actorRole !== Role.MANAGER && actorRole !== Role.ADMIN) {
      throw new ForbiddenException('Nur Manager und Admins können Mitarbeiter blockieren.');
    }

    const employee = await this.prisma.user.findUnique({
      where: { id: employeeId },
    });

    if (!employee || employee.role !== Role.EMPLOYEE) {
      throw new NotFoundException('Mitarbeiter nicht gefunden.');
    }

    const updated = await this.prisma.user.update({
      where: { id: employeeId },
      data: { isChatBlocked: isBlocked },
    });

    // Create Audit Log
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    await this.prisma.actionLog.create({
      data: {
        userId: actorId,
        action: isBlocked ? 'CHAT_BLOCK' : 'CHAT_UNBLOCK',
        details: `${actor?.name || 'System'} ${isBlocked ? 'blockierte' : 'entsperrte'} die Chat-Kommunikation für Mitarbeiter ${employee.name}`,
      },
    });

    return {
      success: true,
      employeeId: updated.id,
      isChatBlocked: updated.isChatBlocked,
    };
  }
}
