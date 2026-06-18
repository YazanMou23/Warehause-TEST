import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { BroadcastDto, EmergencyDto, ReminderDto } from './dto/telegram-messages.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('telegram')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('broadcast')
  @Roles(Role.MANAGER, Role.ADMIN)
  async broadcast(@Body() broadcastDto: BroadcastDto) {
    return this.telegramService.broadcastMessage(broadcastDto.message);
  }

  @Post('emergency')
  @Roles(Role.MANAGER, Role.ADMIN)
  async emergencyAlert(@Body() emergencyDto: EmergencyDto) {
    return this.telegramService.sendEmergencyMessage(
      emergencyDto.warehouseId,
      emergencyDto.message,
    );
  }

  @Post('reminder')
  @Roles(Role.MANAGER, Role.ADMIN)
  async reminder(@Body() reminderDto: ReminderDto) {
    const sent = await this.telegramService.sendAttendanceReminder(
      reminderDto.employeeId,
      reminderDto.message,
    );
    return { success: sent };
  }
}
