import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { PlanningService } from './planning.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EmailService } from '../email/email.service';
import { MessagingService } from '../messaging/messaging.service';

@Controller('planning')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlanningController {
  constructor(
    private readonly planningService: PlanningService,
    private readonly emailService: EmailService,
    private readonly messagingService: MessagingService,
  ) {}

  @Post()
  @Roles(Role.MANAGER, Role.ADMIN)
  create(@Body() createPlanDto: CreatePlanDto, @CurrentUser('id') actorId: string) {
    return this.planningService.create(createPlanDto, actorId);
  }

  /** Test SMTP connection and send a test email — Manager only */
  @Post('test-email')
  @Roles(Role.MANAGER)
  async testEmail(@Body('to') to: string) {
    if (!to) throw new BadRequestException('Required: { "to": "someone@example.com" }');
    const sent = await this.emailService.sendEmail(
      to,
      'LogiFlow — SMTP Test',
      `<div style="font-family:sans-serif;padding:24px;">
        <h2 style="color:#2563eb;">&#10003; SMTP Connection Successful</h2>
        <p>This is a test email from your LogiFlow server.</p>
        <p style="color:#64748b;font-size:12px;">Sent at: ${new Date().toISOString()}</p>
      </div>`,
    );
    return { 
      success: sent === true, 
      message: sent === true ? 'Test email sent successfully.' : `Email failed: ${sent}` 
    };
  }

  /** Test WhatsApp delivery to a given phone number — Manager only */
  @Post('test-whatsapp')
  @Roles(Role.MANAGER)
  async testWhatsApp(
    @Body('phone') phone: string,
    @Body('message') message?: string,
  ) {
    if (!phone) throw new BadRequestException('Required: { "phone": "+49...", "message": "optional" }');
    const text = message || `LogiFlow — WhatsApp Test \ud83d\udce6\nGesendet am: ${new Date().toLocaleString('de-DE')}\nWenn Sie diese Nachricht sehen, funktioniert die WhatsApp-Benachrichtigung korrekt.`;
    const result = await this.messagingService.sendWhatsAppDirect(phone, text);
    return {
      ...result,
      formattedPhone: this.messagingService.formatPhoneNumber(phone),
      sentAt: new Date().toISOString(),
      hint: result.success && !result.error
        ? 'Message delivered via API'
        : result.waLink
        ? `API not available. Open this link to send manually: ${result.waLink}`
        : 'Check WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in .env',
    };
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 100;
    return this.planningService.findAll(p, l, startDate, endDate, warehouseId);
  }

  @Get('query')
  findByDateAndWarehouse(
    @Query('date') date: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    if (!date) {
      throw new BadRequestException('Query parameter "date" is required');
    }
    return this.planningService.findByDateAndWarehouse(date, warehouseId);
  }

  @Delete('bulk')
  @Roles(Role.MANAGER, Role.ADMIN)
  bulkRemove(@Body('ids') ids: string[], @CurrentUser('id') actorId: string) {
    return this.planningService.bulkDeactivate(ids, actorId);
  }

  @Patch('bulk-duplicate')
  @Roles(Role.MANAGER, Role.ADMIN)
  bulkDuplicate(@Body('ids') ids: string[], @CurrentUser('id') actorId: string) {
    return this.planningService.bulkDuplicate(ids, actorId);
  }

  @Patch('bulk-change-hall')
  @Roles(Role.MANAGER, Role.ADMIN)
  bulkChangeHall(
    @Body('ids') ids: string[],
    @Body('hallId') hallId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.planningService.bulkChangeHall(ids, hallId, actorId);
  }

  @Patch('bulk-change-shift')
  @Roles(Role.MANAGER, Role.ADMIN)
  bulkChangeShift(
    @Body('ids') ids: string[],
    @Body('shift') shift: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.planningService.bulkChangeShift(ids, shift, actorId);
  }

  @Patch('bulk-assign-employees')
  @Roles(Role.MANAGER, Role.ADMIN)
  bulkAssignEmployees(
    @Body('ids') ids: string[],
    @Body('employeeIds') employeeIds: string[],
    @CurrentUser('id') actorId: string,
  ) {
    return this.planningService.bulkAssignEmployees(ids, employeeIds, actorId);
  }

  // ─── Employee Plan Segments Endpoints ─────────────────────────────────────

  @Get('segments')
  getSegments(
    @Query('date') date: string,
    @Query('employeeId') employeeId?: string,
  ) {
    if (!date) throw new BadRequestException('Query parameter "date" is required');
    return this.planningService.getEmployeeSegments(date, employeeId);
  }

  @Post('segments')
  @Roles(Role.MANAGER, Role.ADMIN)
  saveSegments(
    @Body('date') date: string,
    @Body('segments') segments: any[],
    @Body('planId') planId?: string,
  ) {
    if (!date) throw new BadRequestException('Field "date" is required');
    return this.planningService.saveEmployeeSegments(date, segments || [], planId);
  }

  @Delete('segments/:id')
  @Roles(Role.MANAGER, Role.ADMIN)
  deleteSegment(@Param('id') id: string) {
    return this.planningService.deleteEmployeeSegment(id);
  }

  // ─── Employee Absence / Status Endpoints ───────────────────────────────────

  @Get('absences')
  getAbsences(
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.planningService.getAbsences(date, startDate, endDate, employeeId);
  }

  @Post('absences')
  @Roles(Role.MANAGER, Role.ADMIN)
  setAbsence(
    @Body() dto: any,
    @CurrentUser('id') actorId: string,
  ) {
    return this.planningService.setAbsence(dto, actorId);
  }

  @Delete('absences')
  @Roles(Role.MANAGER, Role.ADMIN)
  deleteAbsence(
    @Query('employeeId') employeeId: string,
    @Query('date') date: string,
    @CurrentUser('id') actorId: string,
  ) {
    if (!employeeId || !date) {
      throw new BadRequestException('Query parameters "employeeId" and "date" are required');
    }
    return this.planningService.deleteAbsence(employeeId, date, actorId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.planningService.findOne(id);
  }

  @Post(':id/notify')
  @Roles(Role.MANAGER, Role.ADMIN)
  resendNotification(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.planningService.resendPlanNotification(id, actorId);
  }

  @Patch(':id')
  @Roles(Role.MANAGER, Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updatePlanDto: UpdatePlanDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.planningService.update(id, updatePlanDto, actorId);
  }

  @Delete(':id')
  @Roles(Role.MANAGER, Role.ADMIN)
  remove(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.planningService.deactivate(id, actorId);
  }
}

