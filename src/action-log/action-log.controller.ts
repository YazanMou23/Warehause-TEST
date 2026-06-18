import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ActionLogService } from './action-log.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('action-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActionLogController {
  constructor(private readonly actionLogService: ActionLogService) {}

  @Get()
  @Roles(Role.MANAGER)
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 10;
    return this.actionLogService.findAll(p, l, { userId, action, startDate, endDate });
  }

  @Get('stats')
  @Roles(Role.MANAGER)
  getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.actionLogService.getStats(startDate, endDate);
  }
}
