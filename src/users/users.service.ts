import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async create(createUserDto: CreateUserDto, actorId?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { phone: createUserDto.phone },
    });

    if (existing) {
      throw new ConflictException('A user with this phone number already exists');
    }

    if (createUserDto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: createUserDto.email },
      });
      if (existingEmail) {
        throw new ConflictException('A user with this email address already exists');
      }
    }

    if (createUserDto.telegramId) {
      const existingTg = await this.prisma.user.findUnique({
        where: { telegramId: createUserDto.telegramId },
      });
      if (existingTg) {
        throw new ConflictException('A user with this Telegram ID already exists');
      }
    }

    const passwordHash = await bcrypt.hash(createUserDto.passwordHash, 10);

    const user = await this.prisma.user.create({
      data: {
        name: createUserDto.name,
        phone: createUserDto.phone,
        email: createUserDto.email || null,
        passwordHash,
        role: createUserDto.role,
        warehouseId: createUserDto.warehouseId || null,
        hallId: createUserDto.hallId || null,
        telegramId: createUserDto.telegramId || null,
      },
    });

    // Log the action
    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'CREATE_USER',
        details: `Created user ${user.name} (ID: ${user.id}) with role ${user.role}`,
      },
    });

    // Send welcome email asynchronously
    if (user.email) {
      this.emailService.sendWelcomeEmail(user.email, user.name).catch(() => {});
    }

    return user;
  }

  async findAll(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          profilePhoto: true,
          role: true,
          warehouseId: true,
          hallId: true,
          isActive: true,
          telegramId: true,
          createdAt: true,
          updatedAt: true,
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

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        profilePhoto: true,
        role: true,
        warehouseId: true,
        hallId: true,
        isActive: true,
        telegramId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto, actorId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });
      if (existingEmail) {
        throw new ConflictException('A user with this email address already exists');
      }
    }

    const data: any = { ...updateUserDto };

    if (updateUserDto.password) {
      data.passwordHash = await bcrypt.hash(updateUserDto.password, 10);
      delete data.password;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'UPDATE_USER',
        details: `Updated user ${updated.name} (ID: ${updated.id})`,
      },
    });

    return updated;
  }

  async updatePhoto(id: string, profilePhoto: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return this.prisma.user.update({
      where: { id },
      data: { profilePhoto },
    });
  }

  async deactivate(id: string, actorId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'DEACTIVATE_USER',
        details: `Soft deleted / Deactivated user ${updated.name} (ID: ${updated.id})`,
      },
    });

    return { message: 'User deactivated successfully' };
  }

  async bulkDeactivate(ids: string[], actorId?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    if (users.length === 0) {
      throw new NotFoundException('No active users found for the provided IDs');
    }

    const result = await this.prisma.user.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'BULK_DEACTIVATE_USER',
        details: `Soft deleted / Deactivated ${result.count} users: ${users.map((u) => u.name).join(', ')}`,
      },
    });

    return { message: `${result.count} users deactivated successfully` };
  }
}

