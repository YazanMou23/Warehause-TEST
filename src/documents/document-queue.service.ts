import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OcrProviderService } from './ocr-provider.service';
import { DocumentAnalyzerService } from './document-analyzer.service';
import {
  DocumentStatus,
  BatchStatus,
  UniversalDocument,
  DocumentBatch,
} from '@prisma/client';
import { Subject, Observable } from 'rxjs';
import * as fs from 'fs';
import * as os from 'os';

export interface DocumentQueueEvent {
  type: 'document.status.changed' | 'batch.progress.changed' | 'scanner.status.changed';
  batchId?: string;
  documentId?: string;
  status?: string;
  data?: any;
  timestamp: string;
}

@Injectable()
export class DocumentQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentQueueService.name);
  private readonly workerId = `worker_${os.hostname()}_${process.pid}_${Date.now()}`;
  private isRunning = true;
  private queueInterval: NodeJS.Timeout | null = null;
  private isProcessingLoopActive = false;

  // Real-time Event Stream Subject for SSE
  private readonly eventSubject = new Subject<DocumentQueueEvent>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocrProvider: OcrProviderService,
    private readonly documentAnalyzer: DocumentAnalyzerService,
  ) {}

  onModuleInit() {
    this.logger.log(`DocumentQueueService initialized with Worker ID: ${this.workerId}`);
    // Start periodic sequential queue worker loop
    this.queueInterval = setInterval(() => {
      this.processNextInQueue().catch((err) => {
        this.logger.error(`Error in queue worker iteration: ${err.message}`);
      });
    }, 1200);

    // Stale lock recovery interval (every 30 seconds)
    setInterval(() => {
      this.recoverStaleLocks().catch(() => {});
    }, 30000);
  }

  onModuleDestroy() {
    this.isRunning = false;
    if (this.queueInterval) clearInterval(this.queueInterval);
  }

  /**
   * SSE Stream observable for real-time frontend updates.
   */
  getEventStream(): Observable<DocumentQueueEvent> {
    return this.eventSubject.asObservable();
  }

  /**
   * Broadcast an event to connected clients.
   */
  private broadcastEvent(event: Omit<DocumentQueueEvent, 'timestamp'>) {
    const fullEvent: DocumentQueueEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    this.eventSubject.next(fullEvent);
  }

  /**
   * Trigger processing for a batch immediately (e.g. after upload).
   */
  async triggerBatchProcessing(batchId: string): Promise<void> {
    await this.prisma.documentBatch.update({
      where: { id: batchId },
      data: { status: BatchStatus.PROCESSING },
    });
    this.processNextInQueue().catch(() => {});
  }

  /**
   * Pause processing for a batch.
   */
  async pauseBatch(batchId: string, userId?: string): Promise<DocumentBatch> {
    const batch = await this.prisma.documentBatch.update({
      where: { id: batchId },
      data: { status: BatchStatus.PAUSED },
    });

    await this.prisma.documentAuditLog.create({
      data: {
        batchId,
        userId,
        event: 'BATCH_PAUSED',
      },
    });

    this.broadcastEvent({
      type: 'batch.progress.changed',
      batchId,
      status: BatchStatus.PAUSED,
      data: { message: 'Warteschlange angehalten' },
    });

    return batch;
  }

  /**
   * Resume processing for a paused batch.
   */
  async resumeBatch(batchId: string, userId?: string): Promise<DocumentBatch> {
    const batch = await this.prisma.documentBatch.update({
      where: { id: batchId },
      data: { status: BatchStatus.PROCESSING },
    });

    await this.prisma.documentAuditLog.create({
      data: {
        batchId,
        userId,
        event: 'BATCH_RESUMED',
      },
    });

    this.broadcastEvent({
      type: 'batch.progress.changed',
      batchId,
      status: BatchStatus.PROCESSING,
      data: { message: 'Warteschlange fortgesetzt' },
    });

    this.processNextInQueue().catch(() => {});
    return batch;
  }

  /**
   * Skip a document (e.g., if unreadable or failed) so the queue can proceed to Document N+1.
   */
  async skipDocument(docId: string, userId?: string): Promise<UniversalDocument> {
    const doc = await this.prisma.universalDocument.findUnique({
      where: { id: docId },
    });
    if (!doc) throw new Error(`Document ${docId} not found`);

    const updatedDoc = await this.prisma.universalDocument.update({
      where: { id: docId },
      data: {
        status: DocumentStatus.SKIPPED,
        lockWorkerId: null,
        lockExpiresAt: null,
        completedAt: new Date(),
      },
    });

    await this.prisma.documentBatch.update({
      where: { id: doc.batchId },
      data: { skippedCount: { increment: 1 } },
    });

    await this.prisma.documentAuditLog.create({
      data: {
        batchId: doc.batchId,
        documentId: doc.id,
        userId,
        event: 'DOCUMENT_SKIPPED',
        details: { filename: doc.originalFileName },
      },
    });

    this.broadcastEvent({
      type: 'document.status.changed',
      batchId: doc.batchId,
      documentId: doc.id,
      status: DocumentStatus.SKIPPED,
    });

    // Check if batch is completed
    await this.checkBatchCompletion(doc.batchId);

    // Trigger next document
    this.processNextInQueue().catch(() => {});
    return updatedDoc;
  }

  /**
   * Retry a failed document.
   */
  async retryDocument(docId: string, userId?: string): Promise<UniversalDocument> {
    const doc = await this.prisma.universalDocument.findUnique({
      where: { id: docId },
    });
    if (!doc) throw new Error(`Document ${docId} not found`);

    const updatedDoc = await this.prisma.universalDocument.update({
      where: { id: docId },
      data: {
        status: DocumentStatus.QUEUED,
        errorCode: null,
        errorMessage: null,
        lockWorkerId: null,
        lockExpiresAt: null,
      },
    });

    await this.prisma.documentBatch.update({
      where: { id: doc.batchId },
      data: { status: BatchStatus.PROCESSING },
    });

    await this.prisma.documentAuditLog.create({
      data: {
        batchId: doc.batchId,
        documentId: doc.id,
        userId,
        event: 'DOCUMENT_RETRIED',
        details: { filename: doc.originalFileName },
      },
    });

    this.broadcastEvent({
      type: 'document.status.changed',
      batchId: doc.batchId,
      documentId: doc.id,
      status: DocumentStatus.QUEUED,
    });

    this.processNextInQueue().catch(() => {});
    return updatedDoc;
  }

  /**
   * Sequential Queue Processing Engine.
   * STRICT INVARIANT:
   * Document N must completely finish OCR -> AI -> Validation -> CRM Persistence
   * and transition to COMPLETED before Document N+1 is selected.
   */
  private async processNextInQueue(): Promise<void> {
    if (!this.isRunning || this.isProcessingLoopActive) return;

    this.isProcessingLoopActive = true;
    try {
      // Find all active batches in PROCESSING status
      const activeBatches = await this.prisma.documentBatch.findMany({
        where: { status: BatchStatus.PROCESSING },
        orderBy: { createdAt: 'asc' },
      });

      for (const batch of activeBatches) {
        // Check if ANY document in this batch is actively being processed by this or any worker
        const activeDoc = await this.prisma.universalDocument.findFirst({
          where: {
            batchId: batch.id,
            status: {
              in: [
                DocumentStatus.OCR_PROCESSING,
                DocumentStatus.AI_ANALYZING,
                DocumentStatus.PERSISTING,
              ],
            },
            lockExpiresAt: { gt: new Date() },
          },
        });

        // STRICT CONCURRENCY RULE: If 1 document is already active in this queue, DO NOT start another!
        if (activeDoc) {
          continue;
        }

        // Atomically select and lock the NEXT document in sequence (lowest queuePosition)
        const nextDoc = await this.acquireNextDocumentLock(batch.id);
        if (!nextDoc) {
          // No more QUEUED documents in this batch -> check if batch is finished
          await this.checkBatchCompletion(batch.id);
          continue;
        }

        // Execute full pipeline strictly for this single document
        await this.executeDocumentPipeline(nextDoc);
      }
    } finally {
      this.isProcessingLoopActive = false;
    }
  }

  /**
   * Atomically acquire lock on the next document in queue.
   */
  private async acquireNextDocumentLock(batchId: string): Promise<UniversalDocument | null> {
    const lockDurationMs = 2 * 60 * 1000; // 2 minutes lease
    const expiresAt = new Date(Date.now() + lockDurationMs);

    // Find first queued document
    const candidate = await this.prisma.universalDocument.findFirst({
      where: {
        batchId,
        status: DocumentStatus.QUEUED,
      },
      orderBy: { queuePosition: 'asc' },
    });

    if (!candidate) return null;

    // Transition to OCR_PROCESSING and assign worker lock
    const lockedDoc = await this.prisma.universalDocument.update({
      where: { id: candidate.id },
      data: {
        status: DocumentStatus.OCR_PROCESSING,
        lockWorkerId: this.workerId,
        lockedAt: new Date(),
        lockExpiresAt: expiresAt,
        startedAt: candidate.startedAt || new Date(),
        processingAttempts: { increment: 1 },
      },
      include: {
        pages: { orderBy: { pageNumber: 'asc' } },
      },
    });

    this.broadcastEvent({
      type: 'document.status.changed',
      batchId: lockedDoc.batchId,
      documentId: lockedDoc.id,
      status: DocumentStatus.OCR_PROCESSING,
      data: {
        filename: lockedDoc.originalFileName,
        queuePosition: lockedDoc.queuePosition,
      },
    });

    return lockedDoc;
  }

  /**
   * Execute Document Pipeline for a single locked document:
   * OCR -> AI Analysis -> Schema Validation -> CRM Persistence -> Mark COMPLETED.
   */
  private async executeDocumentPipeline(doc: UniversalDocument): Promise<void> {
    this.logger.log(`Starting sequential pipeline for Document #${doc.queuePosition} (${doc.originalFileName})`);

    try {
      // 1. Prepare Page Buffers from disk storage
      const pages = await this.prisma.universalDocumentPage.findMany({
        where: { documentId: doc.id },
        orderBy: { pageNumber: 'asc' },
      });

      const pageBuffers: { buffer: Buffer; mimeType: string }[] = [];
      for (const p of pages) {
        if (fs.existsSync(p.originalPath)) {
          pageBuffers.push({
            buffer: fs.readFileSync(p.originalPath),
            mimeType: doc.mimeType,
          });
        }
      }

      if (pageBuffers.length === 0 && fs.existsSync(doc.filePath)) {
        pageBuffers.push({
          buffer: fs.readFileSync(doc.filePath),
          mimeType: doc.mimeType,
        });
      }

      if (pageBuffers.length === 0) {
        throw new Error(`File buffer not found on disk for document ${doc.originalFileName}`);
      }

      // ── STEP 1: OCR Processing ─────────────────────────────────────────────
      await this.prisma.documentAuditLog.create({
        data: {
          batchId: doc.batchId,
          documentId: doc.id,
          event: 'OCR_STARTED',
          details: { language: doc.ocrLanguage || 'de', pages: pageBuffers.length },
        },
      });

      const ocrResult = await this.ocrProvider.extractText(pageBuffers, doc.ocrLanguage || 'de');

      await this.prisma.universalDocument.update({
        where: { id: doc.id },
        data: {
          ocrRawText: ocrResult.text,
          status: DocumentStatus.AI_ANALYZING,
          lockExpiresAt: new Date(Date.now() + 2 * 60 * 1000), // Refresh lease
        },
      });

      this.broadcastEvent({
        type: 'document.status.changed',
        batchId: doc.batchId,
        documentId: doc.id,
        status: DocumentStatus.AI_ANALYZING,
      });

      // ── STEP 2: AI Analysis & Schema Validation ───────────────────────────
      await this.prisma.documentAuditLog.create({
        data: {
          batchId: doc.batchId,
          documentId: doc.id,
          event: 'AI_ANALYSIS_STARTED',
        },
      });

      const analysisResult = await this.documentAnalyzer.analyzeDocument(ocrResult.text, pageBuffers);

      // ── STEP 3: Transactional Persistence & CRM Updates ──────────────────
      await this.prisma.universalDocument.update({
        where: { id: doc.id },
        data: {
          status: DocumentStatus.PERSISTING,
          lockExpiresAt: new Date(Date.now() + 60 * 1000),
        },
      });

      this.broadcastEvent({
        type: 'document.status.changed',
        batchId: doc.batchId,
        documentId: doc.id,
        status: DocumentStatus.PERSISTING,
      });

      // Execute CRM entity linkage & persistence in transaction
      await this.prisma.$transaction(async (tx) => {
        // Check if extracted document is a TIMESHEET and matched an employee
        if (analysisResult.documentType === 'TIMESHEET' && analysisResult.matchedEntities?.employee?.id) {
          const empId = analysisResult.matchedEntities.employee.id;
          const weekDate = analysisResult.documentDate ? new Date(analysisResult.documentDate) : new Date();

          // Create or link Timesheet entity
          await tx.timesheet.create({
            data: {
              employeeId: empId,
              employeeName: analysisResult.contactPerson || analysisResult.matchedEntities.employee.name,
              weekStartDate: weekDate,
              ocrConfidence: analysisResult.matchedEntities.employee.confidence,
              ocrRawResponse: analysisResult as any,
              createdById: doc.userId,
            },
          });
        }

        // Update Document to COMPLETED
        await tx.universalDocument.update({
          where: { id: doc.id },
          data: {
            status: DocumentStatus.COMPLETED,
            analysisResult: analysisResult as any,
            matchedEntityType: analysisResult.documentType,
            matchedEntityId: analysisResult.matchedEntities?.employee?.id || analysisResult.matchedEntities?.container?.id || null,
            completedAt: new Date(),
            lockWorkerId: null,
            lockExpiresAt: null,
            errorCode: null,
            errorMessage: null,
          },
        });

        // Increment completedCount on Batch
        await tx.documentBatch.update({
          where: { id: doc.batchId },
          data: { completedCount: { increment: 1 } },
        });

        // Log completion audit
        await tx.documentAuditLog.create({
          data: {
            batchId: doc.batchId,
            documentId: doc.id,
            event: 'DOCUMENT_COMPLETED',
            details: {
              type: analysisResult.documentType,
              company: analysisResult.companyName,
              amount: analysisResult.totalAmount,
            },
          },
        });
      });

      this.logger.log(`Document #${doc.queuePosition} (${doc.originalFileName}) COMPLETED.`);

      this.broadcastEvent({
        type: 'document.status.changed',
        batchId: doc.batchId,
        documentId: doc.id,
        status: DocumentStatus.COMPLETED,
        data: { analysisResult },
      });

      // Check if batch is completed
      await this.checkBatchCompletion(doc.batchId);
    } catch (err: any) {
      this.logger.error(`Pipeline failure on document #${doc.queuePosition}: ${err.message}`, err.stack);

      // Handle Failure
      const isMaxAttempts = doc.processingAttempts >= (doc.maxAttempts || 3);
      const nextStatus = isMaxAttempts ? DocumentStatus.FAILED : DocumentStatus.QUEUED;

      await this.prisma.universalDocument.update({
        where: { id: doc.id },
        data: {
          status: nextStatus,
          errorCode: 'PROCESSING_ERROR',
          errorMessage: err.message,
          lockWorkerId: null,
          lockExpiresAt: null,
        },
      });

      if (isMaxAttempts) {
        await this.prisma.documentBatch.update({
          where: { id: doc.batchId },
          data: { failedCount: { increment: 1 } },
        });
      }

      await this.prisma.documentAuditLog.create({
        data: {
          batchId: doc.batchId,
          documentId: doc.id,
          event: isMaxAttempts ? 'DOCUMENT_FAILED' : 'DOCUMENT_RETRY_SCHEDULED',
          details: { error: err.message, attempts: doc.processingAttempts },
        },
      });

      this.broadcastEvent({
        type: 'document.status.changed',
        batchId: doc.batchId,
        documentId: doc.id,
        status: nextStatus,
        data: { error: err.message },
      });

      await this.checkBatchCompletion(doc.batchId);
    }
  }

  /**
   * Check if all documents in batch have reached a terminal state (COMPLETED, FAILED, SKIPPED, CANCELLED).
   */
  private async checkBatchCompletion(batchId: string): Promise<void> {
    const remaining = await this.prisma.universalDocument.count({
      where: {
        batchId,
        status: {
          in: [
            DocumentStatus.CREATED,
            DocumentStatus.QUEUED,
            DocumentStatus.OCR_PROCESSING,
            DocumentStatus.AI_ANALYZING,
            DocumentStatus.PERSISTING,
          ],
        },
      },
    });

    if (remaining === 0) {
      const batch = await this.prisma.documentBatch.findUnique({
        where: { id: batchId },
      });

      if (batch && batch.status !== BatchStatus.COMPLETED) {
        await this.prisma.documentBatch.update({
          where: { id: batchId },
          data: {
            status: BatchStatus.COMPLETED,
            completedAt: new Date(),
          },
        });

        await this.prisma.documentAuditLog.create({
          data: {
            batchId,
            event: 'BATCH_COMPLETED',
            details: {
              completed: batch.completedCount,
              failed: batch.failedCount,
              skipped: batch.skippedCount,
            },
          },
        });

        this.broadcastEvent({
          type: 'batch.progress.changed',
          batchId,
          status: BatchStatus.COMPLETED,
        });

        this.logger.log(`Batch ${batchId} has COMPLETED all documents.`);
      }
    }
  }

  /**
   * Recovery mechanism: Detect stale worker locks (worker crashed mid-flight > 2 min ago) and reset to QUEUED.
   */
  private async recoverStaleLocks(): Promise<void> {
    const staleDocs = await this.prisma.universalDocument.findMany({
      where: {
        status: {
          in: [
            DocumentStatus.OCR_PROCESSING,
            DocumentStatus.AI_ANALYZING,
            DocumentStatus.PERSISTING,
          ],
        },
        lockExpiresAt: { lt: new Date() },
      },
    });

    for (const doc of staleDocs) {
      this.logger.warn(`Recovering stale lock for document ${doc.id} (last worker: ${doc.lockWorkerId})`);
      await this.prisma.universalDocument.update({
        where: { id: doc.id },
        data: {
          status: DocumentStatus.QUEUED,
          lockWorkerId: null,
          lockExpiresAt: null,
        },
      });

      await this.prisma.documentAuditLog.create({
        data: {
          batchId: doc.batchId,
          documentId: doc.id,
          event: 'STALE_LOCK_RECOVERED',
        },
      });

      this.broadcastEvent({
        type: 'document.status.changed',
        batchId: doc.batchId,
        documentId: doc.id,
        status: DocumentStatus.QUEUED,
      });
    }
  }
}
