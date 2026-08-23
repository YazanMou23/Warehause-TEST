import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ScannerService } from './scanner.service';
import { ScanSettingsDto } from './dto/scan-settings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('scanner')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER, Role.ADMIN)
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  /**
   * GET /scanner/discover
   * Discover WiFi/Network and USB cable scanners connected to the system or LAN.
   */
  @Get('discover')
  discover() {
    return this.scannerService.discoverPrinters();
  }

  /**
   * GET /scanner/status
   * Ping the configured scanner — is it online and idle?
   * Optional query params: ?ip=192.168.1.x&port=80
   */
  @Get('status')
  checkStatus(
    @Query('ip') ip?: string,
    @Query('port') port?: string,
  ) {
    return this.scannerService.checkStatus(ip, port ? parseInt(port, 10) : undefined);
  }

  /**
   * GET /scanner/capabilities
   * Returns the scanner's supported DPI values, color modes, and document formats.
   * Optional query params: ?ip=192.168.1.x&port=80
   */
  @Get('capabilities')
  getCapabilities(
    @Query('ip') ip?: string,
    @Query('port') port?: string,
  ) {
    return this.scannerService.getCapabilities(ip, port ? parseInt(port, 10) : undefined);
  }

  /**
   * POST /scanner/scan
   * Trigger a scan and download the raw image directly (binary response).
   * Body (all optional): { scannerIp, scannerPort, colorMode, dpi, format, inputSource }
   */
  @Post('scan')
  async scan(
    @Body() settings: ScanSettingsDto,
    @Res() res: Response,
  ) {
    const { buffer, mimeType } = await this.scannerService.triggerScan(settings);

    const ext = settings.format ?? 'jpeg';
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="scan-${Date.now()}.${ext}"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  /**
   * POST /scanner/scan-to-timesheet
   * Full one-click pipeline:
   *   1. Trigger scan from printer/scanner
   *   2. Run OCR (OpenAI Vision)
   *   3. Create PENDING_REVIEW timesheet
   *
   * Returns the same JSON as POST /timesheets/scan (file-upload flow).
   * Body (all optional): { scannerIp, scannerPort, colorMode, dpi, format, inputSource }
   */
  @Post('scan-to-timesheet')
  scanToTimesheet(
    @Body() settings: ScanSettingsDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.scannerService.scanToTimesheet(settings, currentUser.id);
  }

  /**
   * POST /scanner/scan-and-extract
   * Preview pipeline — NO database write:
   *   1. Trigger scan from printer/scanner
   *   2. Run OCR (OpenAI Vision)
   *   3. Match employee name against DB
   *   4. Return extracted data + match result for review
   *
   * Use this BEFORE scan-to-timesheet to let the user review and confirm data.
   * Body (all optional): { scannerIp, scannerPort, colorMode, dpi, format, inputSource }
   */
  @Post('scan-and-extract')
  scanAndExtract(@Body() settings: ScanSettingsDto) {
    return this.scannerService.scanAndExtract(settings);
  }

  /**
   * GET /scanner/download-installer
   * Download the 1-click Windows Printer Connector installer zip package
   */
  @Get('download-installer')
  async downloadInstaller(@Res() res: Response) {
    const zipBuffer = await this.scannerService.getInstallerZip();
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="LogiFlow-Printer-Connector.zip"',
      'Content-Length': zipBuffer.length,
    });
    res.end(zipBuffer);
  }
}

