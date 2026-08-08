import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { AttendanceReportDto } from './dto/attendance-report.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('clock-in')
  clockIn(@Body() clockInDto: ClockInDto, @CurrentUser() currentUser: any) {
    // Employees can only clock in themselves
    if (currentUser.role === Role.EMPLOYEE && currentUser.id !== clockInDto.employeeId) {
      throw new ForbiddenException('Employees can only clock in themselves');
    }
    return this.attendanceService.clockIn(clockInDto);
  }

  @Post('clock-out')
  clockOut(@Body() clockOutDto: ClockOutDto, @CurrentUser() currentUser: any) {
    // Employees can only clock out themselves
    if (currentUser.role === Role.EMPLOYEE && currentUser.id !== clockOutDto.employeeId) {
      throw new ForbiddenException('Employees can only clock out themselves');
    }
    return this.attendanceService.clockOut(clockOutDto);
  }

  @Post('qr-scan')
  qrScan(@Body('qrCode') qrCode: string, @CurrentUser() currentUser: any) {
    if (!qrCode) {
      throw new BadRequestException('QR-Code ist erforderlich');
    }
    return this.attendanceService.qrScan(currentUser.id, qrCode);
  }

  @Get('daily')
  @Roles(Role.MANAGER, Role.ADMIN)
  getDaily(
    @Query('date') date?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.attendanceService.getDailyAttendance(date, warehouseId);
  }

  @Get('monthly-report/:employeeId')
  getMonthlyReport(
    @Param('employeeId') employeeId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() currentUser: any,
  ) {
    // Auth validation
    if (currentUser.role === Role.EMPLOYEE && currentUser.id !== employeeId) {
      throw new ForbiddenException('You can only view your own monthly reports');
    }

    if (!year || !month) {
      throw new BadRequestException('Query parameters "year" and "month" are required');
    }

    const y = parseInt(year, 10);
    const m = parseInt(month, 10);

    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
      throw new BadRequestException('Invalid year or month format');
    }

    return this.attendanceService.getMonthlyReport(employeeId, y, m);
  }

  @Get('report')
  @Roles(Role.MANAGER, Role.ADMIN)
  async getReport(@Query() query: AttendanceReportDto) {
    return this.attendanceService.getAttendanceReport(query);
  }

  @Put(':id')
  @Roles(Role.MANAGER, Role.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateAttendanceDto) {
    return this.attendanceService.updateAttendance(id, dto);
  }

  @Post('manual')
  @Roles(Role.MANAGER, Role.ADMIN)
  async createManual(@Body() dto: any) {
    return this.attendanceService.createManualEntry(dto);
  }

  @Delete(':id')
  @Roles(Role.MANAGER, Role.ADMIN)
  async delete(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.attendanceService.deleteAttendance(id, currentUser.id);
  }
}

