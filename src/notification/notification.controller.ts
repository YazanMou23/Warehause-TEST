import { Controller, Get, Patch, Param, UseGuards, Post, Body } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  findAll(@CurrentUser('id') userId: string) {
    return this.notificationService.findAllForUser(userId);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notificationService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.notificationService.markAsRead(id, userId);
  }

  @Post('system-alert')
  @Roles(Role.MANAGER, Role.ADMIN)
  createSystemAlert(
    @Body('title') title: string,
    @Body('message') message: string,
  ) {
    return this.notificationService.create({
      title,
      message,
      type: 'SYSTEM_ALERT',
    });
  }
}
