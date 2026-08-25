import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Sse,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';
import { DocumentQueueService, DocumentQueueEvent } from './document-queue.service';
import { ScannerBridgeService } from './scanner-bridge.service';
import { IngestBatchPayloadDto } from './dto/ingest-documents.dto';
import { SaveScannerDeviceDto, TriggerScanOptionsDto } from './dto/scanner-device.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Observable, merge, map } from 'rxjs';

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly queueService: DocumentQueueService,
    private readonly scannerBridge: ScannerBridgeService,
  ) {}

  // ─── SSE Event Stream ────────────────────────────────────────────────────

  /**
   * GET /documents/events
   * Real-time SSE stream for document queue + scanner scan job progress.
   */
  @Sse('events')
  streamEvents(): Observable<{ data: DocumentQueueEvent | any }> {
    return merge(
      this.queueService.getEventStream(),
      this.scannerBridge.getScanEventStream(),
    ).pipe(map((event) => ({ data: event })));
  }

  // ─── Document Batches ────────────────────────────────────────────────────

  /**
   * POST /documents/batches
   */
  @Post('batches')
  @UseGuards(JwtAuthGuard)
  createBatch(
    @CurrentUser() user: any,
    @Body('title') title?: string,
  ) {
    return this.documentsService.createBatch(user.id, title);
  }

  /**
   * GET /documents/batches
   */
  @Get('batches')
  @UseGuards(JwtAuthGuard)
  getBatches(@CurrentUser() user: any) {
    return this.documentsService.getBatches(user.id);
  }

  /**
   * GET /documents/batches/:id
   */
  @Get('batches/:id')
  @UseGuards(JwtAuthGuard)
  getBatchById(@Param('id') id: string) {
    return this.documentsService.getBatchById(id);
  }

  /**
   * POST /documents/ingest
   */
  @Post('ingest')
  @UseGuards(JwtAuthGuard)
  async ingestDocuments(
    @CurrentUser() user: any,
    @Body() payload: IngestBatchPayloadDto,
  ) {
    const result = await this.documentsService.ingestDocuments(user.id, payload);
    await this.queueService.triggerBatchProcessing(result.batch.id);
    return result;
  }

  /**
   * POST /documents/ingest/upload
   */
  @Post('ingest/upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('files', 50))
  async uploadFiles(
    @CurrentUser() user: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('batchId') batchId?: string,
    @Body('batchTitle') batchTitle?: string,
    @Body('ocrLanguage') ocrLanguage?: string,
  ) {
    if (!files || files.length === 0) {
      return { success: false, message: 'Keine Dateien empfangen.' };
    }

    const docInputs = files.map((file) => ({
      originalFileName: file.originalname,
      source: 'UPLOAD' as const,
      mimeType: file.mimetype,
      ocrLanguage: ocrLanguage || 'de',
      pages: [
        {
          pageNumber: 1,
          base64Data: file.buffer.toString('base64'),
          mimeType: file.mimetype,
        },
      ],
    }));

    const result = await this.documentsService.ingestDocuments(user.id, {
      batchId,
      batchTitle,
      documents: docInputs,
    });

    await this.queueService.triggerBatchProcessing(result.batch.id);
    return result;
  }

  /**
   * POST /documents/batches/:id/start
   */
  @Post('batches/:id/start')
  @UseGuards(JwtAuthGuard)
  async startBatch(@Param('id') id: string) {
    await this.queueService.triggerBatchProcessing(id);
    return { success: true, message: 'Verarbeitung gestartet.' };
  }

  /**
   * POST /documents/batches/:id/pause
   */
  @Post('batches/:id/pause')
  @UseGuards(JwtAuthGuard)
  pauseBatch(@Param('id') id: string, @CurrentUser() user: any) {
    return this.queueService.pauseBatch(id, user.id);
  }

  /**
   * POST /documents/batches/:id/resume
   */
  @Post('batches/:id/resume')
  @UseGuards(JwtAuthGuard)
  resumeBatch(@Param('id') id: string, @CurrentUser() user: any) {
    return this.queueService.resumeBatch(id, user.id);
  }

  /**
   * POST /documents/documents/:id/retry
   */
  @Post('documents/:id/retry')
  @UseGuards(JwtAuthGuard)
  retryDocument(@Param('id') id: string, @CurrentUser() user: any) {
    return this.queueService.retryDocument(id, user.id);
  }

  /**
   * POST /documents/documents/:id/skip
   */
  @Post('documents/:id/skip')
  @UseGuards(JwtAuthGuard)
  skipDocument(@Param('id') id: string, @CurrentUser() user: any) {
    return this.queueService.skipDocument(id, user.id);
  }

  /**
   * DELETE /documents/documents/:id
   */
  @Delete('documents/:id')
  @UseGuards(JwtAuthGuard)
  removeDocument(@Param('id') id: string, @CurrentUser() user: any) {
    return this.documentsService.removeDocument(id, user.id);
  }

  /**
   * GET /documents/documents/:id/file
   */
  @Get('documents/:id/file')
  @UseGuards(JwtAuthGuard)
  async getDocumentFile(@Param('id') id: string, @Res() res: Response) {
    const file = await this.documentsService.getDocumentFile(id);
    res.set({
      'Content-Type':        file.mimeType,
      'Content-Disposition': `inline; filename="${file.filename}"`,
      'Content-Length':      file.buffer.length,
    });
    res.end(file.buffer);
  }

  // ─── Scanner Discovery ───────────────────────────────────────────────────

  /**
   * GET /documents/scanner/discover
   * Discover network and USB scanners (delegates to local agent when available).
   */
  @Get('scanner/discover')
  @UseGuards(JwtAuthGuard)
  discoverScanners() {
    return this.scannerBridge.discoverScanners();
  }

  /**
   * GET /documents/scanner/agent-status
   * Check if local scanner agent is running.
   */
  @Get('scanner/agent-status')
  @UseGuards(JwtAuthGuard)
  async getAgentStatus() {
    const available = await this.scannerBridge.isLocalAgentAvailable();
    return {
      agentAvailable: available,
      agentUrl:       'http://127.0.0.1:48281',
      message: available
        ? 'LogiFlow Connector ist aktiv — LAN-Scanner werden erkannt.'
        : 'LogiFlow Connector nicht gefunden. Bitte Connector installieren oder starten für automatische Erkennung.',
    };
  }

  /**
   * GET /documents/scanner/status
   */
  @Get('scanner/status')
  @UseGuards(JwtAuthGuard)
  getScannerStatus(
    @Query('ip') ip?: string,
    @Query('port') port?: string,
  ) {
    return this.scannerBridge.checkScannerStatus(ip, port ? parseInt(port, 10) : undefined);
  }

  /**
   * POST /documents/scanner/scan
   * Trigger direct hardware scan and return page data.
   */
  @Post('scanner/scan')
  @UseGuards(JwtAuthGuard)
  async triggerScannerScan(
    @Body() options: TriggerScanOptionsDto,
    @CurrentUser() user: any,
  ) {
    // Create scan job for tracking
    const job = await this.scannerBridge.createScanJob(user.id, options.deviceId ?? null, options);

    try {
      await this.scannerBridge.updateScanJob(job.id, { status: 'SCANNING', startedAt: new Date() });
      const result = await this.scannerBridge.triggerScan(options);

      await this.scannerBridge.updateScanJob(job.id, {
        status:        'COMPLETED',
        totalPages:    result.pages.length,
        processedPages: result.pages.length,
        completedAt:   new Date(),
      });

      return {
        success:   true,
        jobId:     job.id,
        pageCount: result.pages.length,
        pages:     result.pages.map((p, idx) => ({
          pageNumber: idx + 1,
          mimeType:   p.mimeType,
          base64Data: p.buffer.toString('base64'),
        })),
      };
    } catch (err: any) {
      await this.scannerBridge.updateScanJob(job.id, {
        status:       'FAILED',
        errorMessage: err.message,
        completedAt:  new Date(),
      });
      throw err;
    }
  }

  // ─── Device Registry ─────────────────────────────────────────────────────

  /**
   * GET /documents/scanner/devices
   * List all saved/connected devices for the current user.
   */
  @Get('scanner/devices')
  @UseGuards(JwtAuthGuard)
  getConnectedDevices(@CurrentUser() user: any) {
    return this.scannerBridge.getConnectedDevices(user.id);
  }

  /**
   * POST /documents/scanner/devices
   * Save (connect) a discovered device for the current user.
   */
  @Post('scanner/devices')
  @UseGuards(JwtAuthGuard)
  connectDevice(
    @CurrentUser() user: any,
    @Body() dto: SaveScannerDeviceDto,
  ) {
    return this.scannerBridge.connectDevice(user.id, {
      deviceIdentifier: dto.deviceIdentifier,
      manufacturer:     dto.manufacturer,
      model:            dto.model,
      deviceName:       dto.deviceName,
      lastKnownIp:      dto.lastKnownIp,
      port:             dto.port,
      protocol:         dto.protocol,
      capabilities:     dto.capabilities,
      hasAdf:           dto.capabilities?.hasAdf ?? dto.hasAdf ?? false,
      hasFlatbed:       dto.capabilities?.hasFlatbed ?? dto.hasFlatbed ?? true,
    });
  }

  /**
   * GET /documents/scanner/devices/:id/status
   * Real-time status check for a saved device.
   */
  @Get('scanner/devices/:id/status')
  @UseGuards(JwtAuthGuard)
  getDeviceStatus(@Param('id') id: string, @CurrentUser() user: any) {
    return this.scannerBridge.getDeviceStatus(user.id, id);
  }

  /**
   * DELETE /documents/scanner/devices/:id
   * Disconnect / remove a saved device.
   */
  @Delete('scanner/devices/:id')
  @UseGuards(JwtAuthGuard)
  disconnectDevice(@Param('id') id: string, @CurrentUser() user: any) {
    return this.scannerBridge.disconnectDevice(user.id, id);
  }

  // ─── Scan Jobs ───────────────────────────────────────────────────────────

  /**
   * GET /documents/scanner/jobs/:jobId
   */
  @Get('scanner/jobs/:jobId')
  @UseGuards(JwtAuthGuard)
  getScanJob(@Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.scannerBridge.getScanJob(user.id, jobId);
  }

  /**
   * POST /documents/scanner/jobs/:jobId/cancel
   */
  @Post('scanner/jobs/:jobId/cancel')
  @UseGuards(JwtAuthGuard)
  cancelScanJob(@Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.scannerBridge.cancelScanJob(user.id, jobId);
  }
}
