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
  @Roles(Role.MANAGER, Role.ADMIN)
  getWhatsAppLink(@Body() body: { phone: string; message: string }) {
    const link = this.messagingService.generateWhatsAppLink(body.phone, body.message);
    return { link };
  }

  @Post('whatsapp/send')
  @Roles(Role.MANAGER, Role.ADMIN)
  async sendWhatsAppDirect(@Body() body: { phone: string; message: string }) {
    return this.messagingService.sendWhatsAppDirect(body.phone, body.message);
  }

  @Post('sms')
  @Roles(Role.MANAGER, Role.ADMIN)
  async sendSMS(@Body() body: { phone: string; message: string }) {
    const success = await this.messagingService.sendSMS(body.phone, body.message);
    return { success };
  }

  @Post('broadcast')
  @Roles(Role.MANAGER, Role.ADMIN)
  async broadcast(@Body() body: { type: 'sms' | 'whatsapp'; userIds: string[]; message: string }) {
    return this.messagingService.broadcastMessage(body.type, body.userIds, body.message);
  }
}
