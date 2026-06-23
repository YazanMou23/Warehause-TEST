import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { TimesheetService } from './timesheet.service';
import { TimesheetExportService } from './timesheet-export.service';
import { ConfirmTimesheetDto } from './dto/confirm-timesheet.dto';
import { TimesheetQueryDto } from './dto/timesheet-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('timesheets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER, Role.ADMIN)
export class TimesheetController {
  constructor(
    private readonly timesheetService: TimesheetService,
    private readonly exportService: TimesheetExportService,
  ) {}

  /**
   * POST /timesheets/scan
   * Upload a timesheet image → OCR → fuzzy match → return PENDING_REVIEW timesheet
   */
  @Post('scan')
  @UseInterceptors(FileInterceptor('file'))
  async scan(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: any,
  ) {
    if (!file) {
      throw new BadRequestException('Bitte eine Bilddatei hochladen');
    }
    return this.timesheetService.scanAndCreate(file, currentUser.id);
  }

  /**
   * GET /timesheets
   * List all timesheets with optional filters
   */
  @Get()
  findAll(@Query() query: TimesheetQueryDto) {
    return this.timesheetService.findAll(query);
  }

  /**
   * GET /timesheets/export/:id/pdf
   * Download a confirmed timesheet as PDF
   */
  @Get('export/:id/pdf')
  async exportPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.exportService.exportPdf(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="stundenzettel-${id}.pdf"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  /**
   * GET /timesheets/export/:id/xlsx
   * Download a confirmed timesheet as Excel
   */
  @Get('export/:id/xlsx')
  async exportXlsx(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.exportService.exportXlsx(id);

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="stundenzettel-${id}.xlsx"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  /**
   * GET /timesheets/:id
   * Get a single timesheet with all entries
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.timesheetService.findOne(id);
  }

  /**
   * PUT /timesheets/:id/confirm
   * Confirm (save) a reviewed timesheet after manual correction
   */
  @Put(':id/confirm')
  confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmTimesheetDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.timesheetService.confirmTimesheet(id, dto, currentUser.id);
  }

  /**
   * DELETE /timesheets/:id
   * Delete a PENDING_REVIEW timesheet (confirmed ones are protected)
   */
  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.timesheetService.delete(id, currentUser.id);
  }
}
