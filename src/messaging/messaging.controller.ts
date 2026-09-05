import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import {
  SendWhatsAppDto,
  SendWhatsAppBulkDto,
  BroadcastDto,
  SendWhatsAppToAllDto,
} from './dto/send-whatsapp.dto';

@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post('whatsapp')
  @Roles(Role.MANAGER, Role.ADMIN)
  getWhatsAppLink(@Body() body: SendWhatsAppDto) {
    const link = this.messagingService.generateWhatsAppLink(body.phone, body.message);
    return { link };
  }

  @Post('whatsapp/send')
  @Roles(Role.MANAGER, Role.ADMIN)
  async sendWhatsAppDirect(@Body() body: SendWhatsAppDto) {
    return this.messagingService.sendWhatsAppDirect(body.phone, body.message);
  }

  /**
   * POST /messaging/whatsapp/bulk
   * Send a WhatsApp message to multiple phone numbers at once.
   * Body: { phones: string[], message: string }
   * Returns per-number success, waLink, and any errors.
   */
  @Post('whatsapp/bulk')
  @Roles(Role.MANAGER, Role.ADMIN)
  async sendWhatsAppBulk(@Body() body: SendWhatsAppBulkDto) {
    return this.messagingService.sendWhatsAppBulk(body.phones, body.message);
  }

  @Post('sms')
  @Roles(Role.MANAGER, Role.ADMIN)
  async sendSMS(@Body() body: SendWhatsAppDto) {
    // Bug#7: sendSMS now returns { success, error } — proxy result directly
    return this.messagingService.sendSMS(body.phone, body.message);
  }

  @Post('broadcast')
  @Roles(Role.MANAGER, Role.ADMIN)
  async broadcast(@Body() body: BroadcastDto) {
    return this.messagingService.broadcastMessage(body.type, body.userIds, body.message);
  }

  /**
   * POST /messaging/whatsapp/send-all
   * Send WhatsApp notification to all active users/employees in the system.
   * Body: { message: string }
   */
  @Post('whatsapp/send-all')
  @Roles(Role.MANAGER, Role.ADMIN)
  async sendWhatsAppToAll(@Body() body: SendWhatsAppToAllDto) {
    return this.messagingService.sendWhatsAppToAllUsers(body.message);
  }
}
