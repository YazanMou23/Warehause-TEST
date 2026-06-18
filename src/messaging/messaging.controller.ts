import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post('whatsapp')
  @Roles(Role.ADMIN, Role.TEAM_LEADER)
  getWhatsAppLink(@Body() body: { phone: string; message: string }) {
    const link = this.messagingService.generateWhatsAppLink(body.phone, body.message);
    return { link };
  }

  @Post('sms')
  @Roles(Role.ADMIN, Role.TEAM_LEADER)
  async sendSMS(@Body() body: { phone: string; message: string }) {
    const success = await this.messagingService.sendSMS(body.phone, body.message);
    return { success };
  }

  @Post('broadcast')
  @Roles(Role.ADMIN, Role.TEAM_LEADER)
  async broadcast(@Body() body: { type: 'sms' | 'whatsapp'; userIds: string[]; message: string }) {
    return this.messagingService.broadcastMessage(body.type, body.userIds, body.message);
  }
}
