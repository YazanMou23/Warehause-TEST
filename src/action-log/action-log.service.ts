import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActionLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string | null, action: string, details: string) {
    return this.prisma.actionLog.create({
      data: {
        userId,
        action,
        details,
      },
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    filters?: {
      userId?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    if (filters?.action) {
      where.action = filters.action;
    }

    if (filters?.startDate || filters?.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        where.timestamp.lte = end;
      }
    }

    const [total, data] = await Promise.all([
      this.prisma.actionLog.count({ where }),
      this.prisma.actionLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              role: true,
            },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getStats(startDate?: string, endDate?: string) {
    const where: any = {};

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.timestamp.lte = end;
      }
    }

    const logs = await this.prisma.actionLog.groupBy({
      by: ['action'],
      _count: {
        id: true,
      },
      where,
    });

    return logs.map((log) => ({
      action: log.action,
      count: log._count.id,
    }));
  }
}
