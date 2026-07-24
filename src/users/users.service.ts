import { Injectable, ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { EmailService } from '../email/email.service';
import { Role, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';

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
        address: createUserDto.address || null,
        passwordHash,
        role: createUserDto.role || Role.EMPLOYEE,
        warehouseId: createUserDto.warehouseId || null,
        hallId: createUserDto.hallId || null,
        telegramId: createUserDto.telegramId || null,
        employmentStart: createUserDto.employmentStart ? new Date(createUserDto.employmentStart) : new Date(),
        employmentEnd: createUserDto.employmentEnd ? new Date(createUserDto.employmentEnd) : null,
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

  async findAll(page = 1, limit = 10, actorRole?: Role, targetRole?: Role) {
    const skip = (page - 1) * limit;
    
    // Admin cannot see Manager accounts
    const where: any = { deletedAt: null };
    if (actorRole === Role.ADMIN) {
      where.role = { not: Role.MANAGER };
    }

    if (targetRole) {
      if (actorRole === Role.ADMIN && targetRole === Role.MANAGER) {
        throw new ForbiddenException('Admins cannot view Manager accounts');
      }
      where.role = targetRole;
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
          address: true,
          profilePhoto: true,
          role: true,
          warehouseId: true,
          hallId: true,
          isActive: true,
          telegramId: true,
          employmentStart: true,
          employmentEnd: true,
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
        address: true,
        profilePhoto: true,
        role: true,
        warehouseId: true,
        hallId: true,
        isActive: true,
        telegramId: true,
        employmentStart: true,
        employmentEnd: true,
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

    // Admin cannot modify other Admin accounts
    if (actorRole === Role.ADMIN && user.role === Role.ADMIN && user.id !== actorId) {
      throw new ForbiddenException('Access denied: Admins cannot modify other Admin accounts');
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

    if (updateUserDto.employmentStart) {
      data.employmentStart = new Date(updateUserDto.employmentStart);
    }

    if (updateUserDto.employmentEnd !== undefined) {
      data.employmentEnd = updateUserDto.employmentEnd ? new Date(updateUserDto.employmentEnd) : null;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
    });

    // Logging & Notification
    if (updateUserDto.role && updateUserDto.role !== user.role) {
      await this.prisma.actionLog.create({
        data: {
          userId: actorId,
          action: 'ROLE_CHANGE',
          details: `Changed role of user ${updated.name} (${updated.username}) from ${user.role} to ${updated.role}`,
        },
      });

      await this.prisma.notification.create({
        data: {
          userId: id,
          title: 'Benutzerrolle geändert',
          message: `Ihre Rolle wurde von ${user.role} auf ${updated.role} geändert.`,
          type: 'ROLE_CHANGED',
        },
      }).catch(() => {});
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
        details: `Bulk deactivated ${result.count} users: ${users.map((u) => u.username).join(', ')}`,
      },
    });

    return { message: `${result.count} users deactivated successfully` };
  }

  async bulkActivate(ids: string[], actorId?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
      },
    });

    if (users.length === 0) {
      throw new NotFoundException('No users found for the provided IDs');
    }

    const result = await this.prisma.user.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        isActive: true,
        deletedAt: null,
      },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'USER_ACTIVATE',
        details: `Bulk activated ${result.count} users: ${users.map((u) => u.username).join(', ')}`,
      },
    });

    return { message: `${result.count} users activated successfully` };
  }

  async bulkAssignHall(ids: string[], hallId: string, actorId?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
      },
    });

    if (users.length === 0) {
      throw new NotFoundException('No users found for the provided IDs');
    }

    const hall = await this.prisma.hall.findFirst({
      where: { id: hallId, deletedAt: null },
    });

    if (!hall) {
      throw new NotFoundException(`Hall with ID ${hallId} not found`);
    }

    const result = await this.prisma.user.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        hallId,
        warehouseId: hall.warehouseId,
      },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'USER_ASSIGN_HALL',
        details: `Bulk assigned ${result.count} users to hall ${hall.name} (Warehouse ID: ${hall.warehouseId})`,
      },
    });

    return { message: `${result.count} users assigned to hall successfully` };
  }

  async bulkAssignRole(ids: string[], role: Role, actorId?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: ids },
      },
    });

    if (users.length === 0) {
      throw new NotFoundException('No users found for the provided IDs');
    }

    const result = await this.prisma.user.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        role,
      },
    });

    await this.prisma.actionLog.create({
      data: {
        userId: actorId || null,
        action: 'USER_ASSIGN_ROLE',
        details: `Bulk changed role of ${result.count} users to ${role}`,
      },
    });

    return { message: `${result.count} users roles updated successfully` };
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
      employmentStart: user.employmentStart,
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

  private getCellValueString(cell: ExcelJS.Cell): string {
    if (!cell || cell.value === null || cell.value === undefined) return '';
    if (typeof cell.value === 'object') {
      if (cell.value instanceof Date) {
        return cell.value.toISOString().split('T')[0];
      }
      if ('result' in cell.value && cell.value.result !== undefined && cell.value.result !== null) {
        return String(cell.value.result).trim();
      }
      if ('text' in cell.value && cell.value.text) {
        return String(cell.value.text).trim();
      }
      if ('richText' in cell.value && Array.isArray(cell.value.richText)) {
        return cell.value.richText.map((t) => t.text).join('').trim();
      }
    }
    return String(cell.value).trim();
  }

  async previewEmployeesImportFromExcel(fileBuffer: Buffer, actorRole?: Role) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('Uploaded Excel file is empty.');
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(fileBuffer as any);
    } catch (error) {
      throw new BadRequestException('Invalid or corrupted Excel file format.');
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      throw new BadRequestException('The Excel file contains no data rows. Header must be on row 1, data on row 2+.');
    }

    // Map column headers from Row 1
    const headerRow = worksheet.getRow(1);
    const colMap: { [key: string]: number } = {};

    headerRow.eachCell((cell, colNumber) => {
      const headerText = this.getCellValueString(cell).toLowerCase().replace(/[^a-z0-9]/g, '');

      if (['vorname', 'firstname', 'first_name'].some((k) => headerText.includes(k))) {
        colMap['vorname'] = colNumber;
      } else if (['nachname', 'lastname', 'last_name', 'familienname'].some((k) => headerText.includes(k))) {
        colMap['lastName'] = colNumber;
      } else if (['name', 'mitarbeiter', 'mitarbeitername', 'fullname'].some((k) => headerText.includes(k))) {
        if (!colMap['name']) colMap['name'] = colNumber;
      } else if (['phone', 'telefon', 'telefonnummer', 'handy', 'handynummer', 'mobil', 'mobile'].some((k) => headerText.includes(k))) {
        if (!colMap['phone']) colMap['phone'] = colNumber;
      } else if (['adresse', 'address', 'anschrift', 'strasse', 'street'].some((k) => headerText.includes(k))) {
        if (!colMap['address']) colMap['address'] = colNumber;
      } else if (['username', 'benutzername', 'nutzername'].some((k) => headerText.includes(k))) {
        if (!colMap['username']) colMap['username'] = colNumber;
      } else if (['email', 'email', 'mail'].some((k) => headerText.includes(k))) {
        if (!colMap['email']) colMap['email'] = colNumber;
      } else if (['password', 'passwort', 'kennwort'].some((k) => headerText.includes(k))) {
        if (!colMap['password']) colMap['password'] = colNumber;
      } else if (['role', 'rolle'].some((k) => headerText.includes(k))) {
        if (!colMap['role']) colMap['role'] = colNumber;
      } else if (['warehouse', 'lager', 'lagerhaus'].some((k) => headerText.includes(k))) {
        if (!colMap['warehouse']) colMap['warehouse'] = colNumber;
      } else if (['hall', 'halle'].some((k) => headerText.includes(k))) {
        if (!colMap['hall']) colMap['hall'] = colNumber;
      } else if (['telegram', 'telegramid'].some((k) => headerText.includes(k))) {
        if (!colMap['telegramId']) colMap['telegramId'] = colNumber;
      } else if (['employmentstart', 'eintrittsdatum', 'startdate', 'eintritt'].some((k) => headerText.includes(k))) {
        if (!colMap['employmentStart']) colMap['employmentStart'] = colNumber;
      }
    });

    if (Object.keys(colMap).length === 0 && worksheet.columnCount >= 1) {
      const firstDataCell = worksheet.getRow(2).getCell(1);
      const val = this.getCellValueString(firstDataCell).trim();
      if (/^\+?[0-9\s-]{5,20}$/.test(val)) {
        colMap['phone'] = 1;
      } else {
        colMap['name'] = 1;
      }
    }

    const warehouses = await this.prisma.warehouse.findMany({ where: { deletedAt: null } });
    const halls = await this.prisma.hall.findMany({ where: { deletedAt: null } });
    const existingUsers = await this.prisma.user.findMany({
      select: { email: true, username: true, phone: true },
    });

    const dbEmails = new Set(existingUsers.map((u) => u.email?.toLowerCase()).filter(Boolean));
    const dbUsernames = new Set(existingUsers.map((u) => u.username?.toLowerCase()).filter(Boolean));
    const dbPhones = new Set(existingUsers.map((u) => u.phone?.toLowerCase()).filter(Boolean));

    const batchEmails = new Set<string>();
    const batchUsernames = new Set<string>();
    const batchPhones = new Set<string>();

    const rowResults: Array<{
      row: number;
      name: string;
      username: string;
      email: string | null;
      phone: string;
      role: string;
      warehouse: string;
      hall: string;
      address: string;
      password?: string;
      telegramId?: string;
      employmentStart?: string;
      status: 'READY' | 'WARNING' | 'ERROR';
      issues: Array<{
        column: string;
        value: string;
        reason: string;
        suggestedFix: string;
        type: 'error' | 'warning';
      }>;
      resolvedData?: {
        name: string;
        username: string;
        email: string | null;
        phone: string;
        address: string | null;
        passwordHash?: string;
        rawPassword?: string;
        role: Role;
        warehouseId: string | null;
        hallId: string | null;
        telegramId: string | null;
        employmentStart: Date;
      };
    }> = [];

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);

      const rawVorname = colMap['vorname'] ? this.getCellValueString(row.getCell(colMap['vorname'])) : '';
      const rawLastName = colMap['lastName'] ? this.getCellValueString(row.getCell(colMap['lastName'])) : '';
      const rawFullName = colMap['name'] ? this.getCellValueString(row.getCell(colMap['name'])) : '';

      let rawName = '';
      if (rawVorname || rawLastName) {
        rawName = `${rawVorname} ${rawLastName}`.trim();
      } else if (rawFullName) {
        rawName = rawFullName;
      }

      const rawPhone = colMap['phone'] ? this.getCellValueString(row.getCell(colMap['phone'])) : '';
      const rawAddress = colMap['address'] ? this.getCellValueString(row.getCell(colMap['address'])) : '';
      const rawUsername = colMap['username'] ? this.getCellValueString(row.getCell(colMap['username'])) : '';
      const rawEmail = colMap['email'] ? this.getCellValueString(row.getCell(colMap['email'])) : '';
      const rawPassword = colMap['password'] ? this.getCellValueString(row.getCell(colMap['password'])) : '';
      const rawRole = colMap['role'] ? this.getCellValueString(row.getCell(colMap['role'])) : '';
      const rawWarehouse = colMap['warehouse'] ? this.getCellValueString(row.getCell(colMap['warehouse'])) : '';
      const rawHall = colMap['hall'] ? this.getCellValueString(row.getCell(colMap['hall'])) : '';
      const rawTelegramId = colMap['telegramId'] ? this.getCellValueString(row.getCell(colMap['telegramId'])) : '';
      const rawStart = colMap['employmentStart'] ? this.getCellValueString(row.getCell(colMap['employmentStart'])) : '';

      // Skip blank rows
      let rowHasData = false;
      row.eachCell((cell) => {
        if (this.getCellValueString(cell).trim().length > 0) {
          rowHasData = true;
        }
      });
      if (!rowHasData && !rawName && !rawPhone && !rawUsername && !rawEmail) {
        continue;
      }

      const issues: Array<{
        column: string;
        value: string;
        reason: string;
        suggestedFix: string;
        type: 'error' | 'warning';
      }> = [];

      // Validate Name
      let name = rawName;
      if (!name) {
        if (rawUsername) {
          name = rawUsername.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          issues.push({
            column: 'Name/Vorname',
            value: '',
            reason: 'Name is missing.',
            suggestedFix: `Derived name '${name}' from username.`,
            type: 'warning',
          });
        } else if (rawEmail) {
          const prefix = rawEmail.split('@')[0];
          name = prefix.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          issues.push({
            column: 'Name/Vorname',
            value: '',
            reason: 'Name is missing.',
            suggestedFix: `Derived name '${name}' from email.`,
            type: 'warning',
          });
        } else if (rawPhone) {
          name = `Mitarbeiter ${rawPhone}`;
        } else {
          issues.push({
            column: 'Vorname/Nachname',
            value: '',
            reason: 'First name and Last name are missing.',
            suggestedFix: 'Provide a valid employee name.',
            type: 'error',
          });
        }
      }

      // Validate Email
      let email: string | null = rawEmail || null;
      if (rawEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(rawEmail)) {
          issues.push({
            column: 'E-Mail',
            value: rawEmail,
            reason: `Invalid email format '${rawEmail}'.`,
            suggestedFix: 'Provide a valid email address (e.g. user@domain.de).',
            type: 'error',
          });
        } else if (dbEmails.has(rawEmail.toLowerCase()) || batchEmails.has(rawEmail.toLowerCase())) {
          issues.push({
            column: 'E-Mail',
            value: rawEmail,
            reason: `Email address '${rawEmail}' already exists in database or import file.`,
            suggestedFix: 'Use a unique email address or leave blank.',
            type: 'error',
          });
        } else {
          batchEmails.add(rawEmail.toLowerCase());
        }
      }

      // Validate Username
      let username = rawUsername;
      if (rawUsername) {
        if (dbUsernames.has(rawUsername.toLowerCase()) || batchUsernames.has(rawUsername.toLowerCase())) {
          issues.push({
            column: 'Benutzername',
            value: rawUsername,
            reason: `Username '${rawUsername}' already exists.`,
            suggestedFix: 'Choose a unique username.',
            type: 'error',
          });
        } else {
          batchUsernames.add(rawUsername.toLowerCase());
        }
      } else if (name) {
        const baseUser = name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
        let candidate = (baseUser || `user_${rowNumber}`).toLowerCase();
        let counter = 1;
        while (dbUsernames.has(candidate) || batchUsernames.has(candidate)) {
          candidate = `${baseUser}_${counter}`.toLowerCase();
          counter++;
        }
        username = candidate;
        batchUsernames.add(username);
      }

      // Validate Phone (optional, duplicate phone numbers allowed)
      let phone = rawPhone;
      if (!phone) {
        phone = `+49000${String(Date.now() + rowNumber).slice(-8)}`;
      }

      // Validate Role
      let role: Role = Role.EMPLOYEE;
      if (rawRole) {
        const upper = rawRole.toUpperCase();
        if (upper === 'ADMIN' || upper.includes('ADMIN')) {
          role = Role.ADMIN;
        } else if (upper === 'MANAGER' || upper.includes('MANAGER') || upper.includes('LEITER')) {
          role = Role.MANAGER;
        } else if (upper === 'EMPLOYEE' || upper.includes('EMPLOYEE') || upper.includes('MITARBEITER')) {
          role = Role.EMPLOYEE;
        } else {
          issues.push({
            column: 'Rolle',
            value: rawRole,
            reason: `Role '${rawRole}' does not exist.`,
            suggestedFix: "Use a valid role: 'Employee', 'Manager', or 'Admin'.",
            type: 'error',
          });
        }
      }

      if (actorRole === Role.ADMIN && (role === Role.ADMIN || role === Role.MANAGER)) {
        issues.push({
          column: 'Rolle',
          value: rawRole || role,
          reason: 'Admin users are restricted from assigning Manager or Admin roles.',
          suggestedFix: 'Role will be set to Employee.',
          type: 'warning',
        });
        role = Role.EMPLOYEE;
      }

      // Validate Warehouse
      let warehouseId: string | null = null;
      if (rawWarehouse) {
        const matchedWh = warehouses.find(
          (w) => w.id === rawWarehouse || w.name.toLowerCase() === rawWarehouse.toLowerCase()
        );
        if (matchedWh) {
          warehouseId = matchedWh.id;
        } else {
          issues.push({
            column: 'Lager',
            value: rawWarehouse,
            reason: `Warehouse '${rawWarehouse}' does not exist in database.`,
            suggestedFix: 'Verify warehouse name or create it before importing.',
            type: 'error',
          });
        }
      }

      // Validate Hall
      let hallId: string | null = null;
      if (rawHall) {
        const matchedHall = halls.find(
          (h) =>
            h.id === rawHall ||
            h.name.toLowerCase() === rawHall.toLowerCase() ||
            (warehouseId && h.warehouseId === warehouseId && h.name.toLowerCase() === rawHall.toLowerCase())
        );
        if (matchedHall) {
          hallId = matchedHall.id;
        } else {
          issues.push({
            column: 'Halle',
            value: rawHall,
            reason: `Hall '${rawHall}' does not exist in database.`,
            suggestedFix: 'Verify hall name or create it before importing.',
            type: 'error',
          });
        }
      }

      // Validate Employment Start Date
      let employmentStart: Date = new Date();
      if (rawStart) {
        const parsedDate = new Date(rawStart);
        if (isNaN(parsedDate.getTime())) {
          issues.push({
            column: 'Eintrittsdatum',
            value: rawStart,
            reason: `Invalid date format '${rawStart}'.`,
            suggestedFix: 'Use YYYY-MM-DD or DD.MM.YYYY.',
            type: 'error',
          });
        }
      }

      const hasError = issues.some((i) => i.type === 'error');
      const hasWarning = issues.some((i) => i.type === 'warning');
      const status = hasError ? 'ERROR' : hasWarning ? 'WARNING' : 'READY';

      rowResults.push({
        row: rowNumber,
        name: name || rawName || `Row ${rowNumber}`,
        username,
        email,
        phone,
        role,
        warehouse: rawWarehouse,
        hall: rawHall,
        address: rawAddress,
        password: rawPassword || 'employeepassword',
        telegramId: rawTelegramId,
        employmentStart: employmentStart.toISOString().split('T')[0],
        status,
        issues,
        resolvedData: !hasError
          ? {
              name,
              username,
              email,
              phone,
              address: rawAddress || null,
              rawPassword: rawPassword || 'employeepassword',
              role,
              warehouseId,
              hallId,
              telegramId: rawTelegramId || null,
              employmentStart,
            }
          : undefined,
      });
    }

    const totalRows = rowResults.length;
    const readyCount = rowResults.filter((r) => r.status === 'READY').length;
    const warningCount = rowResults.filter((r) => r.status === 'WARNING').length;
    const errorCount = rowResults.filter((r) => r.status === 'ERROR').length;

    return {
      summary: {
        totalRows,
        validCount: readyCount + warningCount,
        readyCount,
        warningCount,
        errorCount,
      },
      rows: rowResults,
    };
  }

  async importEmployeesFromExcel(fileBuffer: Buffer, actorId?: string, actorRole?: Role) {
    const preview = await this.previewEmployeesImportFromExcel(fileBuffer, actorRole);
    const validRows = preview.rows.filter((r) => r.status !== 'ERROR' && r.resolvedData);

    const createdUsers: any[] = [];
    const errors: Array<{ row: number; name?: string; column?: string; reason: string; suggestedFix?: string }> = [];

    // Record pre-import error row details for the summary report
    for (const row of preview.rows) {
      if (rStatus(row.status)) {
        for (const issue of row.issues.filter((i) => i.type === 'error')) {
          errors.push({
            row: row.row,
            name: row.name,
            column: issue.column,
            reason: issue.reason,
            suggestedFix: issue.suggestedFix,
          });
        }
      }
    }

    function rStatus(status: string) {
      return status === 'ERROR';
    }

    // Process valid rows row-by-row independently
    for (const rowItem of validRows) {
      const data = rowItem.resolvedData!;
      try {
        const passwordHash = await bcrypt.hash(data.rawPassword || 'employeepassword', 10);
        let candidateUsername = data.username;
        let newUser: any = null;
        let attempt = 0;

        while (!newUser && attempt < 10) {
          try {
            newUser = await this.prisma.user.create({
              data: {
                username: candidateUsername,
                name: data.name,
                phone: data.phone,
                email: data.email,
                address: data.address,
                passwordHash,
                role: data.role,
                warehouseId: data.warehouseId,
                hallId: data.hallId,
                telegramId: data.telegramId,
                employmentStart: data.employmentStart,
              },
              select: {
                id: true,
                username: true,
                name: true,
                phone: true,
                email: true,
                address: true,
                role: true,
                warehouseId: true,
                hallId: true,
                telegramId: true,
                employmentStart: true,
                createdAt: true,
              },
            });
          } catch (createErr: any) {
            // Handle username unique constraint error gracefully by auto-resolving suffix
            if (createErr?.code === 'P2002' || (createErr?.message && createErr.message.toLowerCase().includes('username'))) {
              attempt++;
              candidateUsername = `${data.username}_${attempt}_${Math.floor(100 + Math.random() * 900)}`;
            } else {
              throw createErr;
            }
          }
        }

        if (newUser) {
          createdUsers.push(newUser);
          if (newUser.email) {
            this.emailService.sendWelcomeEmail(newUser.email, newUser.name).catch(() => {});
          }
        }
      } catch (err: any) {
        errors.push({
          row: rowItem.row,
          name: rowItem.name,
          reason: err.message || 'Database insert failed',
        });
      }
    }

    if (createdUsers.length > 0 || errors.length > 0) {
      await this.prisma.actionLog.create({
        data: {
          userId: actorId || null,
          action: 'IMPORT_EMPLOYEES_EXCEL',
          details: `Import complete: ${createdUsers.length} employee(s) imported, ${errors.length} error issue(s) skipped`,
        },
      });
    }

    return {
      success: true,
      message: `Import complete: ${createdUsers.length} employee(s) created, ${preview.summary.errorCount} row(s) skipped due to errors.`,
      summary: {
        totalProcessed: preview.summary.totalRows,
        createdCount: createdUsers.length,
        skippedCount: preview.summary.errorCount,
        failedCount: preview.summary.errorCount,
        errors,
      },
      createdUsers,
    };
  }

  async generateEmployeesExcelTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Mitarbeiter Template');

    worksheet.columns = [
      { header: 'Vorname', key: 'vorname', width: 16 },
      { header: 'Nachname', key: 'lastName', width: 18 },
      { header: 'Telefon', key: 'phone', width: 18 },
      { header: 'Adresse', key: 'address', width: 25 },
      { header: 'Benutzername', key: 'username', width: 18 },
      { header: 'E-Mail', key: 'email', width: 25 },
      { header: 'Passwort', key: 'password', width: 16 },
      { header: 'Rolle', key: 'role', width: 14 },
      { header: 'Lagerhaus', key: 'warehouse', width: 18 },
      { header: 'Halle', key: 'hall', width: 16 },
      { header: 'Telegram ID', key: 'telegramId', width: 16 },
      { header: 'Eintrittsdatum', key: 'employmentStart', width: 16 },
    ];

    // Style Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '1E3A5F' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add Example Rows
    worksheet.addRow({
      vorname: 'Max',
      lastName: 'Mustermann',
      phone: '+491705555555',
      address: 'Musterstraße 1, 47051 Duisburg',
      username: 'mmustermann',
      email: 'max@example.com',
      password: 'Start1234!',
      role: 'EMPLOYEE',
      warehouse: 'Lager 1',
      hall: 'Halle A',
      telegramId: '',
      employmentStart: '2026-01-15',
    });

    worksheet.addRow({
      vorname: 'Erika',
      name: 'Musterfrau',
      phone: '+491706666666',
      address: 'Hauptstraße 12, 47057 Duisburg',
      username: 'emusterfrau',
      email: 'erika@example.com',
      password: 'Start1234!',
      role: 'EMPLOYEE',
      warehouse: '',
      hall: '',
      telegramId: '',
      employmentStart: '2026-02-01',
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

