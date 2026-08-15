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
import { TriggerScanOptionsDto } from './dto/trigger-scan.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Observable, map } from 'rxjs';

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly queueService: DocumentQueueService,
    private readonly scannerBridge: ScannerBridgeService,
  ) {}

  /**
   * SSE Real-time Event Stream for live progress updates across batches, documents, and scanners.
   * Route: GET /documents/events
   */
  @Sse('events')
  streamEvents(): Observable<{ data: DocumentQueueEvent }> {
    return this.queueService.getEventStream().pipe(
      map((event) => ({ data: event })),
    );
  }

  /**
   * POST /documents/batches
   * Create a new document batch container.
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
   * List all batches for current user / system.
   */
  @Get('batches')
  @UseGuards(JwtAuthGuard)
  getBatches(@CurrentUser() user: any) {
    return this.documentsService.getBatches(user.id);
  }

  /**
   * GET /documents/batches/:id
   * Get full details of a batch, including all documents, pages, and queue progress.
   */
  @Get('batches/:id')
  @UseGuards(JwtAuthGuard)
  getBatchById(@Param('id') id: string) {
    return this.documentsService.getBatchById(id);
  }

  /**
   * POST /documents/ingest
   * Ingest structured document payload (Camera captures, Uploaded files, Scanned batches, Drag & Drop).
   */
  @Post('ingest')
  @UseGuards(JwtAuthGuard)
  async ingestDocuments(
    @CurrentUser() user: any,
    @Body() payload: IngestBatchPayloadDto,
  ) {
    const result = await this.documentsService.ingestDocuments(user.id, payload);
    // Automatically trigger queue processing for this batch
    await this.queueService.triggerBatchProcessing(result.batch.id);
    return result;
  }

  /**
   * POST /documents/ingest/upload
   * Multipart file upload helper for standard file inputs.
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
   * Download / preview original or processed document.
   */
  @Get('documents/:id/file')
  @UseGuards(JwtAuthGuard)
  async getDocumentFile(@Param('id') id: string, @Res() res: Response) {
    const file = await this.documentsService.getDocumentFile(id);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${file.filename}"`,
      'Content-Length': file.buffer.length,
    });
    res.end(file.buffer);
  }

  /**
   * GET /documents/scanner/discover
   * Discover real network scanners (eSCL/AirScan) and USB scanners (WIA).
   */
  @Get('scanner/discover')
  @UseGuards(JwtAuthGuard)
  discoverScanners() {
    return this.scannerBridge.discoverScanners();
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
  async triggerScannerScan(@Body() options: TriggerScanOptionsDto) {
    const result = await this.scannerBridge.triggerScan(options);
    return {
      success: true,
      pageCount: result.pages.length,
      pages: result.pages.map((p, idx) => ({
        pageNumber: idx + 1,
        mimeType: p.mimeType,
        base64Data: p.buffer.toString('base64'),
      })),
    };
  }
}
