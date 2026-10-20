import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Role } from '@prisma/client';
import {
  SendWhatsAppDto,
  SendWhatsAppBulkDto,
  BroadcastDto,
  SendWhatsAppToAllDto,
  SendWhatsAppInteractiveDto,
  SendWhatsAppTemplateDto,
  SendWhatsAppTemplateBulkDto,
} from './dto/send-whatsapp.dto';

@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  /**
   * GET /messaging/webhook
   * Meta Webhook Verification.
   * When you click "Verifizieren und speichern" in the Meta Developer Dashboard,
   * Meta sends a GET request with hub.mode, hub.verify_token, and hub.challenge.
   */
  @Get('webhook')
  @Public()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const verifyToken =
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'logiflow_whatsapp_verify_2026';

    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }

    throw new ForbiddenException('Invalid verification token');
  }

  /**
   * POST /messaging/webhook
   * Meta Webhook Event Receiver.
   * Meta sends incoming messages and message delivery status updates here.
   */
  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: any) {
    await this.messagingService.handleWebhookPayload(body);
    return 'EVENT_RECEIVED';
  }

  /**
   * POST /messaging/webhook/simulate
   * Manually simulate an incoming employee WhatsApp message (e.g. 1, 2, or custom note)
   */
  @Post('webhook/simulate')
  @Roles(Role.MANAGER, Role.ADMIN)
  async simulateWebhook(@Body() body: { phone: string; message: string }) {
    return this.messagingService.simulateIncomingMessage(body.phone, body.message);
  }

  /**
   * GET /messaging/webhook/status
   * View the required Meta Webhook callback URL, token, and setup instructions
   */
  @Get('webhook/status')
  @Public()
  getWebhookStatus() {
    return this.messagingService.getWebhookStatus();
  }

  /**
   * GET /messaging/check-connection
   * Diagnostic check of Meta WhatsApp Cloud API credentials
   */
  @Get('check-connection')
  @Public()
  async checkConnection() {
    return this.messagingService.checkConnection();
  }

  /**
   * GET /messaging/sync-waba
   * Subscribe Meta App to the WhatsApp Business Account so incoming messages and button clicks are delivered
   */
  @Get('sync-waba')
  @Public()
  async syncWaba(@Query('wabaId') wabaId?: string) {
    return this.messagingService.syncWabaWebhookSubscription(wabaId);
  }


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
   * POST /messaging/whatsapp/interactive
   * Send an interactive message with buttons (max 3) via WhatsApp Cloud API
   */
  @Post('whatsapp/interactive')
  @Roles(Role.MANAGER, Role.ADMIN)
  async sendWhatsAppInteractive(@Body() body: SendWhatsAppInteractiveDto) {
    return this.messagingService.sendWhatsAppInteractive(
      body.phone,
      body.body,
      body.buttons,
      body.header,
      body.footer,
    );
  }

  /**
   * POST /messaging/whatsapp/template
   * Send an approved WhatsApp Message Template (Meta Cloud API)
   * Works outside the 24-hour customer service window for any recipient.
   */
  @Post('whatsapp/template')
  @Roles(Role.MANAGER, Role.ADMIN)
  async sendWhatsAppTemplate(@Body() body: SendWhatsAppTemplateDto) {
    return this.messagingService.sendWhatsAppTemplate(
      body.phone,
      body.templateName,
      body.parameters,
      body.languageCode,
    );
  }

  /**
   * POST /messaging/whatsapp/template/bulk
   * Send an approved WhatsApp Message Template to multiple recipients
   */
  @Post('whatsapp/template/bulk')
  @Roles(Role.MANAGER, Role.ADMIN)
  async sendWhatsAppTemplateBulk(@Body() body: SendWhatsAppTemplateBulkDto) {
    return this.messagingService.sendWhatsAppTemplateBulk(
      body.recipients,
      body.templateName,
      body.languageCode,
    );
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
