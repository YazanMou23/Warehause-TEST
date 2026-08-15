import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DocumentSource,
  DocumentStatus,
  BatchStatus,
  UniversalDocument,
  DocumentBatch,
} from '@prisma/client';
import { IngestBatchPayloadDto, IngestDocumentInputDto } from './dto/ingest-documents.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly storageRoot = path.join(process.cwd(), 'uploads', 'documents');

  constructor(private readonly prisma: PrismaService) {
    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }
  }

  /**
   * Create a new document batch in DRAFT status.
   */
  async createBatch(userId: string, title?: string): Promise<DocumentBatch> {
    const batch = await this.prisma.documentBatch.create({
      data: {
        title: title || `Stapel #${Date.now().toString().slice(-6)}`,
        status: BatchStatus.DRAFT,
        createdById: userId,
      },
    });

    await this.logAuditEvent(batch.id, null, userId, 'BATCH_CREATED', {
      title: batch.title,
    });

    return batch;
  }

  /**
   * Ingest documents (from Scanner, Camera, Upload, Drag & Drop) into a batch.
   * Multi-page documents are stored with individual pages and enqueued.
   */
  async ingestDocuments(
    userId: string,
    payload: IngestBatchPayloadDto,
  ): Promise<{ batch: DocumentBatch; documents: UniversalDocument[] }> {
    let batchId = payload.batchId;

    if (!batchId) {
      const newBatch = await this.createBatch(userId, payload.batchTitle);
      batchId = newBatch.id;
    }

    const batch = await this.prisma.documentBatch.findUnique({
      where: { id: batchId },
      include: { documents: true },
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    let nextQueuePos = batch.documents.length + 1;
    const createdDocs: UniversalDocument[] = [];

    for (const docInput of payload.documents) {
      if (!docInput.pages || docInput.pages.length === 0) {
        throw new BadRequestException(`Document ${docInput.originalFileName} has no pages.`);
      }

      // Save primary / first page buffer or merged file
      const docFolder = path.join(this.storageRoot, batchId, `doc_${Date.now()}_${nextQueuePos}`);
      fs.mkdirSync(docFolder, { recursive: true });

      const firstPage = docInput.pages[0];
      const mime = docInput.mimeType || firstPage.mimeType || 'image/jpeg';
      const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';

      const primaryFilePath = path.join(docFolder, `original.${ext}`);
      const firstBuffer = Buffer.from(
        firstPage.base64Data.replace(/^data:image\/\w+;base64,/, '').replace(/^data:application\/pdf;base64,/, ''),
        'base64',
      );
      fs.writeFileSync(primaryFilePath, firstBuffer);

      const createdDoc = await this.prisma.universalDocument.create({
        data: {
          batchId,
          userId,
          source: docInput.source || DocumentSource.UPLOAD,
          status: DocumentStatus.QUEUED,
          queuePosition: nextQueuePos,
          originalFileName: docInput.originalFileName,
          mimeType: mime,
          fileSize: firstBuffer.length,
          filePath: primaryFilePath,
          pageCount: docInput.pages.length,
          ocrLanguage: docInput.ocrLanguage || 'de',
        },
      });

      // Save each page record
      for (let i = 0; i < docInput.pages.length; i++) {
        const page = docInput.pages[i];
        const pageBuffer = Buffer.from(
          page.base64Data.replace(/^data:image\/\w+;base64,/, '').replace(/^data:application\/pdf;base64,/, ''),
          'base64',
        );
        const pagePath = path.join(docFolder, `page_${i + 1}.${ext}`);
        fs.writeFileSync(pagePath, pageBuffer);

        await this.prisma.universalDocumentPage.create({
          data: {
            documentId: createdDoc.id,
            pageNumber: i + 1,
            originalPath: pagePath,
          },
        });
      }

      await this.logAuditEvent(batchId, createdDoc.id, userId, 'DOCUMENT_QUEUED', {
        filename: docInput.originalFileName,
        source: docInput.source,
        pages: docInput.pages.length,
      });

      createdDocs.push(createdDoc);
      nextQueuePos++;
    }

    // Update batch totals
    const updatedBatch = await this.prisma.documentBatch.update({
      where: { id: batchId },
      data: {
        totalDocuments: { increment: createdDocs.length },
        status: BatchStatus.PROCESSING,
        startedAt: batch.startedAt ? undefined : new Date(),
      },
      include: { documents: { orderBy: { queuePosition: 'asc' } } },
    });

    return { batch: updatedBatch, documents: createdDocs };
  }

  /**
   * Fetch all batches with summary stats.
   */
  async getBatches(userId: string) {
    return this.prisma.documentBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        documents: {
          orderBy: { queuePosition: 'asc' },
          include: { pages: true },
        },
        createdBy: {
          select: { id: true, name: true, role: true },
        },
      },
    });
  }

  /**
   * Fetch single batch with all documents and pages.
   */
  async getBatchById(batchId: string) {
    const batch = await this.prisma.documentBatch.findUnique({
      where: { id: batchId },
      include: {
        documents: {
          orderBy: { queuePosition: 'asc' },
          include: { pages: { orderBy: { pageNumber: 'asc' } } },
        },
        createdBy: {
          select: { id: true, name: true, role: true },
        },
        auditLogs: {
          orderBy: { timestamp: 'desc' },
          take: 30,
        },
      },
    });

    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    return batch;
  }

  /**
   * Log an immutable audit event.
   */
  async logAuditEvent(
    batchId: string | null,
    documentId: string | null,
    userId: string | null,
    event: string,
    details?: any,
  ) {
    return this.prisma.documentAuditLog.create({
      data: {
        batchId,
        documentId,
        userId,
        event,
        details: details || {},
      },
    });
  }

  /**
   * Remove or cancel a document before or during processing.
   */
  async removeDocument(docId: string, userId: string) {
    const doc = await this.prisma.universalDocument.findUnique({
      where: { id: docId },
    });
    if (!doc) throw new NotFoundException(`Document ${docId} not found`);

    if (doc.status === DocumentStatus.COMPLETED) {
      throw new BadRequestException('Bereits verarbeitete Dokumente können nicht aus der Warteschlange entfernt werden.');
    }

    await this.prisma.universalDocument.update({
      where: { id: docId },
      data: { status: DocumentStatus.CANCELLED },
    });

    await this.logAuditEvent(doc.batchId, doc.id, userId, 'DOCUMENT_CANCELLED', {
      filename: doc.originalFileName,
    });

    return { success: true, message: 'Dokument storniert.' };
  }

  /**
   * Get file buffer for download/preview.
   */
  async getDocumentFile(docId: string): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const doc = await this.prisma.universalDocument.findUnique({
      where: { id: docId },
      include: { pages: { orderBy: { pageNumber: 'asc' } } },
    });
    if (!doc) throw new NotFoundException(`Document ${docId} not found`);

    const filePath = doc.processedFilePath || doc.filePath;
    if (!fs.existsSync(filePath)) {
      // If primary file missing, check first page
      if (doc.pages.length > 0 && fs.existsSync(doc.pages[0].originalPath)) {
        const buf = fs.readFileSync(doc.pages[0].originalPath);
        return { buffer: buf, mimeType: doc.mimeType, filename: doc.originalFileName };
      }
      throw new NotFoundException('Datei auf dem Server nicht gefunden.');
    }

    const buffer = fs.readFileSync(filePath);
    return { buffer, mimeType: doc.mimeType, filename: doc.originalFileName };
  }
}
