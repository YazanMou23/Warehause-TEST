import { Injectable, ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { EmailService } from '../email/email.service';
import { Role } from '@prisma/client';
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
        address: createUserDto.address || null,
        passwordHash,
        role: createUserDto.role || Role.EMPLOYEE,
        warehouseId: createUserDto.warehouseId || null,
        hallId: createUserDto.hallId || null,
        telegramId: createUserDto.telegramId || null,
        employmentStart: createUserDto.employmentStart ? new Date(createUserDto.employmentStart) : new Date(),
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

  async importEmployeesFromExcel(fileBuffer: Buffer, actorId?: string, actorRole?: Role) {
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

    if ((!colMap['name'] && !colMap['vorname'] && !colMap['lastName']) || !colMap['phone']) {
      throw new BadRequestException(
        'Excel header must contain at least "Name" (or "Vorname" / "Nachname") and "Telefon" (or "Phone") columns.'
      );
    }

    const warehouses = await this.prisma.warehouse.findMany({ where: { deletedAt: null } });
    const halls = await this.prisma.hall.findMany({ where: { deletedAt: null } });

    const createdUsers: any[] = [];
    const errors: Array<{ row: number; name?: string; phone?: string; reason: string }> = [];

    // Process data rows starting from row 2
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);

      const rawVorname = colMap['vorname'] ? this.getCellValueString(row.getCell(colMap['vorname'])) : '';
      const rawLastName = colMap['lastName'] ? this.getCellValueString(row.getCell(colMap['lastName'])) : '';
      const rawFullName = colMap['name'] ? this.getCellValueString(row.getCell(colMap['name'])) : '';

      let rawName = '';
      if (rawVorname || rawLastName) {
        rawName = `${rawVorname} ${rawLastName}`.trim();
      } else {
        rawName = rawFullName;
      }

      const rawPhone = colMap['phone'] ? this.getCellValueString(row.getCell(colMap['phone'])) : '';
      const rawAddress = colMap['address'] ? this.getCellValueString(row.getCell(colMap['address'])) : '';

      // Skip row if both name and phone are empty
      if (!rawName && !rawPhone) {
        continue;
      }

      if (!rawName) {
        errors.push({ row: rowNumber, phone: rawPhone, reason: 'Name is missing' });
        continue;
      }
      if (!rawPhone) {
        errors.push({ row: rowNumber, name: rawName, reason: 'Phone number is missing' });
        continue;
      }

      const rawUsername = colMap['username'] ? this.getCellValueString(row.getCell(colMap['username'])) : '';
      const rawEmail = colMap['email'] ? this.getCellValueString(row.getCell(colMap['email'])) : '';
      const rawPassword = colMap['password'] ? this.getCellValueString(row.getCell(colMap['password'])) : '';
      const rawRole = colMap['role'] ? this.getCellValueString(row.getCell(colMap['role'])) : '';
      const rawWarehouse = colMap['warehouse'] ? this.getCellValueString(row.getCell(colMap['warehouse'])) : '';
      const rawHall = colMap['hall'] ? this.getCellValueString(row.getCell(colMap['hall'])) : '';
      const rawTelegramId = colMap['telegramId'] ? this.getCellValueString(row.getCell(colMap['telegramId'])) : '';
      const rawStart = colMap['employmentStart'] ? this.getCellValueString(row.getCell(colMap['employmentStart'])) : '';

      // Auto-generate username if not provided
      let username = rawUsername;
      if (!username) {
        const cleanPhone = rawPhone.replace(/\D/g, '');
        const cleanName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
        username = cleanName ? `${cleanName}_${cleanPhone.slice(-4) || 'emp'}` : `emp_${cleanPhone}`;
      }

      // Default password if missing
      const password = rawPassword || 'employeepassword';

      // Parse Role
      let role: Role = Role.EMPLOYEE;
      if (rawRole) {
        const upperRole = rawRole.toUpperCase();
        if (upperRole.includes('ADMIN')) {
          role = Role.ADMIN;
        } else if (upperRole.includes('MANAGER') || upperRole.includes('LEITER')) {
          role = Role.MANAGER;
        } else {
          role = Role.EMPLOYEE;
        }
      }

      // Admin role restrictions
      if (actorRole === Role.ADMIN && (role === Role.ADMIN || role === Role.MANAGER)) {
        role = Role.EMPLOYEE;
      }

      // Resolve Warehouse ID
      let warehouseId: string | null = null;
      if (rawWarehouse) {
        const matchedWh = warehouses.find(
          (w) => w.id === rawWarehouse || w.name.toLowerCase() === rawWarehouse.toLowerCase()
        );
        if (matchedWh) {
          warehouseId = matchedWh.id;
        }
      }

      // Resolve Hall ID
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
        }
      }

      // Parse employmentStart date
      let employmentStart: Date = new Date();
      if (rawStart) {
        const parsedDate = new Date(rawStart);
        if (!isNaN(parsedDate.getTime())) {
          employmentStart = parsedDate;
        }
      }

      // Conflict checks
      const existingUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            { username },
            { phone: rawPhone },
            ...(rawEmail ? [{ email: rawEmail }] : []),
            ...(rawTelegramId ? [{ telegramId: rawTelegramId }] : []),
          ],
        },
      });

      if (existingUser) {
        let reason = 'User conflict: ';
        if (existingUser.username === username) reason += `Username "${username}" already exists. `;
        if (existingUser.phone === rawPhone) reason += `Phone "${rawPhone}" already exists. `;
        if (rawEmail && existingUser.email === rawEmail) reason += `Email "${rawEmail}" already exists. `;
        if (rawTelegramId && existingUser.telegramId === rawTelegramId) reason += `Telegram ID "${rawTelegramId}" already exists. `;

        errors.push({ row: rowNumber, name: rawName, phone: rawPhone, reason: reason.trim() });
        continue;
      }

      // Hash password and create user
      try {
        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = await this.prisma.user.create({
          data: {
            username,
            name: rawName,
            phone: rawPhone,
            email: rawEmail || null,
            address: rawAddress || null,
            passwordHash,
            role,
            warehouseId,
            hallId,
            telegramId: rawTelegramId || null,
            employmentStart,
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

        createdUsers.push(newUser);

        if (newUser.email) {
          this.emailService.sendWelcomeEmail(newUser.email, newUser.name).catch(() => {});
        }
      } catch (err: any) {
        errors.push({ row: rowNumber, name: rawName, phone: rawPhone, reason: err.message || 'Database creation failed' });
      }
    }

    if (createdUsers.length > 0) {
      await this.prisma.actionLog.create({
        data: {
          userId: actorId || null,
          action: 'IMPORT_EMPLOYEES_EXCEL',
          details: `Imported ${createdUsers.length} employees from Excel file (${errors.length} skipped/failed)`,
        },
      });
    }

    return {
      success: true,
      message: `Import complete: ${createdUsers.length} employee(s) created, ${errors.length} row(s) skipped/failed.`,
      summary: {
        totalProcessed: createdUsers.length + errors.length,
        createdCount: createdUsers.length,
        failedCount: errors.length,
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
      { header: 'Name', key: 'name', width: 18 },
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
      name: 'Mustermann',
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

