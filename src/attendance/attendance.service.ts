import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private getTodayMidnight(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  async clockIn(clockInDto: ClockInDto) {
    // Verify user exists and is active
    const user = await this.prisma.user.findFirst({
      where: { id: clockInDto.employeeId, isActive: true, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`Active employee with ID ${clockInDto.employeeId} not found`);
    }

    // Verify warehouse & hall
    const hall = await this.prisma.hall.findFirst({
      where: { id: clockInDto.hallId, warehouseId: clockInDto.warehouseId, deletedAt: null },
    });
    if (!hall) {
      throw new NotFoundException('Specified hall does not exist in the specified warehouse');
    }

    // Check if user is already clocked in (clockOut is null)
    const activeShift = await this.prisma.attendance.findFirst({
      where: {
        employeeId: clockInDto.employeeId,
        clockOut: null,
      },
    });

    if (activeShift) {
      throw new BadRequestException('Employee is already clocked in');
    }

    const today = this.getTodayMidnight();

    const attendance = await this.prisma.attendance.create({
      data: {
        employeeId: clockInDto.employeeId,
        warehouseId: clockInDto.warehouseId,
        hallId: clockInDto.hallId,
        clockIn: new Date(),
        date: today,
      },
    });

    return attendance;
  }

  async clockOut(clockOutDto: ClockOutDto) {
    // Find active shift
    const activeShift = await this.prisma.attendance.findFirst({
      where: {
        employeeId: clockOutDto.employeeId,
        clockOut: null,
      },
    });

    if (!activeShift) {
      throw new BadRequestException('Employee is not clocked in');
    }

    const clockOutTime = new Date();
    const durationMs = clockOutTime.getTime() - activeShift.clockIn.getTime();
    const totalHours = Math.round((durationMs / 3600000) * 100) / 100; // Round to 2 decimal places

    const updatedShift = await this.prisma.attendance.update({
      where: { id: activeShift.id },
      data: {
        clockOut: clockOutTime,
        totalHours,
      },
    });

    return updatedShift;
  }

  async getDailyAttendance(dateStr?: string, warehouseId?: string) {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    targetDate.setUTCHours(0, 0, 0, 0);

    const where: any = { date: targetDate };
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    const data = await this.prisma.attendance.findMany({
      where,
      include: {
        employee: {
          select: { id: true, name: true, phone: true },
        },
        warehouse: { select: { name: true } },
        hall: { select: { name: true } },
      },
      orderBy: { clockIn: 'desc' },
    });

    return data;
  }

  async getMonthlyReport(employeeId: string, year: number, month: number) {
    // Verify user
    const user = await this.prisma.user.findFirst({
      where: { id: employeeId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    // Set first and last day of the month in UTC
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const records = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        clockIn: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        warehouse: { select: { name: true } },
        hall: { select: { name: true } },
      },
      orderBy: { clockIn: 'asc' },
    });

    const totalHours = records.reduce((sum, r) => sum + (r.totalHours || 0), 0);

    return {
      employee: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
      month,
      year,
      totalHours: Math.round(totalHours * 100) / 100,
      recordCount: records.length,
      records: records.map((r) => ({
        id: r.id,
        date: r.date.toISOString().split('T')[0],
        clockIn: r.clockIn,
        clockOut: r.clockOut,
        totalHours: r.totalHours,
        warehouseName: r.warehouse.name,
        hallName: r.hall.name,
      })),
    };
  }
}
