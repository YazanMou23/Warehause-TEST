import { Injectable, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { EmailService } from '../email/email.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async create(createUserDto: CreateUserDto, actorId?: string, actorRole?: Role) {
    // Admin cannot create ADMIN or MANAGER
    if (actorRole === Role.ADMIN && (createUserDto.role === Role.ADMIN || createUserDto.role === Role.MANAGER)) {
      throw new ForbiddenException('Admins can only create Employee accounts');
    }

    // Check username uniqueness
    const existingUsername = await this.prisma.user.findFirst({
      where: { username: createUserDto.username },
    });
    if (existingUsername) {
      throw new ConflictException('A user with this username already exists');
    }

    const existingPhone = await this.prisma.user.findFirst({
      where: { phone: createUserDto.phone },
    });
    if (existingPhone) {
      throw new ConflictException('A user with this phone number already exists');
    }

    if (createUserDto.email) {
      const existingEmail = await this.prisma.user.findFirst({
        where: { email: createUserDto.email },
      });
      if (existingEmail) {
        throw new ConflictException('A user with this email address already exists');
      }
    }

    if (createUserDto.telegramId) {
      const existingTg = await this.prisma.user.findFirst({
        where: { telegramId: createUserDto.telegramId },
      });
      if (existingTg) {
        throw new ConflictException('A user with this Telegram ID already exists');
      }
    }

    const passwordHash = await bcrypt.hash(createUserDto.passwordHash, 10);

    const user = await this.prisma.user.create({
      data: {
        username: createUserDto.username,
        name: createUserDto.name,
        phone: createUserDto.phone,
        email: createUserDto.email || null,
        passwordHash,
        role: createUserDto.role || Role.EMPLOYEE,
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
        details: `Created user ${user.name} (${user.username}) with role ${user.role}`,
      },
    });

    // Send welcome email asynchronously
    if (user.email) {
      this.emailService.sendWelcomeEmail(user.email, user.name).catch(() => {});
    }

    return user;
  }

  async findAll(page = 1, limit = 10, actorRole?: Role) {
    const skip = (page - 1) * limit;
    
    // Admin cannot see Manager accounts
    const where: any = { deletedAt: null };
    if (actorRole === Role.ADMIN) {
      where.role = { not: Role.MANAGER };
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
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

  async findOne(id: string, actorRole?: Role) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        username: true,
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

    if (actorRole === Role.ADMIN && user.role === Role.MANAGER) {
      throw new ForbiddenException('Access denied: No access to Manager accounts');
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto, actorId: string, actorRole?: Role) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Admin cannot modify Manager accounts
    if (actorRole === Role.ADMIN && user.role === Role.MANAGER) {
      throw new ForbiddenException('Access denied: No access to Manager accounts');
    }

    // Role Promotion checks
    if (updateUserDto.role && updateUserDto.role !== user.role) {
      if (actorRole !== Role.MANAGER) {
        throw new ForbiddenException('Only Managers can change user roles');
      }
    }

    // Credential check
    const isChangingCredentials = 
      (updateUserDto.username && updateUserDto.username !== user.username) ||
      updateUserDto.password ||
      (updateUserDto.phone && updateUserDto.phone !== user.phone);

    if (isChangingCredentials) {
      if (actorRole !== Role.MANAGER && actorRole !== Role.ADMIN) {
        throw new ForbiddenException('Employees cannot change username, password, or phone number');
      }
    }

    // Username check
    if (updateUserDto.username && updateUserDto.username !== user.username) {
      const existingUsername = await this.prisma.user.findFirst({
        where: { username: updateUserDto.username },
      });
      if (existingUsername) {
        throw new ConflictException('A user with this username already exists');
      }
    }

    // Phone check
    if (updateUserDto.phone && updateUserDto.phone !== user.phone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: { phone: updateUserDto.phone },
      });
      if (existingPhone) {
        throw new ConflictException('A user with this phone number already exists');
      }
    }

    // Email check
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingEmail = await this.prisma.user.findFirst({
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

    // Logging
    if (updateUserDto.role && updateUserDto.role !== user.role) {
      await this.prisma.actionLog.create({
        data: {
          userId: actorId,
          action: 'ROLE_CHANGE',
          details: `Changed role of user ${updated.name} (${updated.username}) from ${user.role} to ${updated.role}`,
        },
      });
    } else if (isChangingCredentials) {
      await this.prisma.actionLog.create({
        data: {
          userId: actorId,
          action: 'CREDENTIAL_CHANGE',
          details: `Updated credentials for user ${updated.name} (${updated.username})`,
        },
      });
    } else {
      await this.prisma.actionLog.create({
        data: {
          userId: actorId,
          action: 'UPDATE_USER',
          details: `Updated user profile details for ${updated.name} (${updated.username})`,
        },
      });
    }

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

  async deactivate(id: string, actorId: string, actorRole?: Role) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (actorRole === Role.ADMIN && user.role === Role.MANAGER) {
      throw new ForbiddenException('Access denied: No access to Manager accounts');
    }
    if (actorRole === Role.ADMIN && user.role === Role.ADMIN) {
      throw new ForbiddenException('Access denied: Admins cannot delete other Admins');
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
        userId: actorId,
        action: 'USER_DELETE',
        details: `Deleted user ${updated.name} (${updated.username}) with role ${updated.role}`,
      },
    });

    return { message: 'User deactivated successfully' };
  }

  async bulkDeactivate(ids: string[], actorId: string, actorRole?: Role) {
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    if (users.length === 0) {
      throw new NotFoundException('No active users found for the provided IDs');
    }

    // Admin cannot deactivate Admins or Managers
    if (actorRole === Role.ADMIN) {
      const nonEmployees = users.filter((u) => u.role !== Role.EMPLOYEE);
      if (nonEmployees.length > 0) {
        throw new ForbiddenException('Admins can only deactivate Employee accounts');
      }
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
        userId: actorId,
        action: 'USER_DELETE',
        details: `Bulk deleted ${result.count} users: ${users.map((u) => u.username).join(', ')}`,
      },
    });

    return { message: `${result.count} users deactivated successfully` };
  }

  async getEmployeeDashboardSummary(employeeId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: employeeId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    const now = new Date();
    
    // 1. Current clock-in status
    const activeShift = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        clockOut: null,
      },
      include: {
        warehouse: { select: { name: true } },
        hall: { select: { name: true } },
      },
    });

    // 2. Today's worked hours
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const todayRecords = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        clockIn: { gte: todayStart, lte: todayEnd },
      },
    });
    let todayHours = todayRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0);
    // If currently clocked in, add duration from clockIn to now
    if (activeShift) {
      const activeDurationHours = (now.getTime() - activeShift.clockIn.getTime()) / 3600000;
      todayHours += activeDurationHours;
    }
    todayHours = Math.round(todayHours * 100) / 100;

    // 3. Weekly worked hours (current week starting Monday)
    const currentDay = now.getDay();
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1; // 0 is Sunday
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday);
    const weekRecords = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        clockIn: { gte: weekStart },
      },
    });
    let weeklyHours = weekRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0);
    if (activeShift && activeShift.clockIn >= weekStart) {
      const activeDurationHours = (now.getTime() - activeShift.clockIn.getTime()) / 3600000;
      weeklyHours += activeDurationHours;
    }
    weeklyHours = Math.round(weeklyHours * 100) / 100;

    // 4. Monthly worked hours
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRecords = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        clockIn: { gte: monthStart },
      },
    });
    let monthlyHours = monthRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0);
    if (activeShift && activeShift.clockIn >= monthStart) {
      const activeDurationHours = (now.getTime() - activeShift.clockIn.getTime()) / 3600000;
      monthlyHours += activeDurationHours;
    }
    monthlyHours = Math.round(monthlyHours * 100) / 100;

    // 5. Active/Assigned plans for today
    const plansToday = await this.prisma.plan.findMany({
      where: {
        date: todayStart,
        deletedAt: null,
        assignedEmployees: {
          some: { employeeId },
        },
      },
      include: {
        warehouse: { select: { name: true } },
        hall: { select: { name: true } },
        assignedContainers: { include: { container: true } },
        assignedEmployees: { include: { employee: { select: { id: true, name: true, phone: true } } } },
      },
    });

    const formattedPlansToday = plansToday.map(p => ({
      id: p.id,
      date: p.date,
      warehouseId: p.warehouseId,
      warehouseName: p.warehouse.name,
      hallId: p.hallId,
      hallName: p.hall.name,
      assignedContainers: p.assignedContainers.map(c => c.container),
      assignedEmployees: p.assignedEmployees.map(e => e.employee),
    }));

    // 6. Plans history (past plans)
    const pastPlans = await this.prisma.plan.findMany({
      where: {
        date: { lt: todayStart },
        deletedAt: null,
        assignedEmployees: {
          some: { employeeId },
        },
      },
      take: 10,
      orderBy: { date: 'desc' },
      include: {
        warehouse: { select: { name: true } },
        hall: { select: { name: true } },
        assignedContainers: { include: { container: true } },
        assignedEmployees: { include: { employee: { select: { id: true, name: true, phone: true } } } },
      },
    });

    const formattedPastPlans = pastPlans.map(p => ({
      id: p.id,
      date: p.date,
      warehouseId: p.warehouseId,
      warehouseName: p.warehouse.name,
      hallId: p.hallId,
      hallName: p.hall.name,
      assignedContainers: p.assignedContainers.map(c => c.container),
      assignedEmployees: p.assignedEmployees.map(e => e.employee),
    }));

    // 7. Work history (recent attendance logs)
    const attendanceHistory = await this.prisma.attendance.findMany({
      where: { employeeId },
      orderBy: { clockIn: 'desc' },
      take: 20,
      include: {
        warehouse: { select: { name: true } },
        hall: { select: { name: true } },
      },
    });

    const formattedAttendanceHistory = attendanceHistory.map(r => ({
      id: r.id,
      date: r.date,
      clockIn: r.clockIn,
      clockOut: r.clockOut,
      totalHours: r.totalHours,
      warehouseName: r.warehouse.name,
      hallName: r.hall.name,
    }));

    return {
      activeShift: activeShift ? {
        id: activeShift.id,
        clockIn: activeShift.clockIn,
        warehouseId: activeShift.warehouseId,
        warehouseName: activeShift.warehouse.name,
        hallId: activeShift.hallId,
        hallName: activeShift.hall.name,
      } : null,
      hoursSummary: {
        today: todayHours,
        week: weeklyHours,
        month: monthlyHours,
      },
      plansToday: formattedPlansToday,
      plansHistory: formattedPastPlans,
      workHistory: formattedAttendanceHistory,
    };
  }
}

