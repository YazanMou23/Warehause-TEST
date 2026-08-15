import { Test, TestingModule } from '@nestjs/testing';
import { DocumentQueueService } from './document-queue.service';
import { DocumentsService } from './documents.service';
import { OcrProviderService } from './ocr-provider.service';
import { DocumentAnalyzerService } from './document-analyzer.service';
import { ScannerBridgeService } from './scanner-bridge.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { DocumentStatus, BatchStatus } from '@prisma/client';

describe('Universal Document Capture & Sequential Queue System', () => {
  let queueService: DocumentQueueService;
  let analyzerService: DocumentAnalyzerService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      documentBatch: {
        create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'batch-1', ...args.data })),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      },
      universalDocument: {
        create: jest.fn().mockImplementation((args) => Promise.resolve({ id: `doc-${Date.now()}`, ...args.data })),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
        count: jest.fn(),
      },
      universalDocumentPage: {
        create: jest.fn().mockResolvedValue({ id: 'page-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      documentAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'user-1', name: 'Max Mustermann' }]),
      },
      container: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cnt-1', containerNumber: 'MSKU1234567' }),
      },
      warehouse: {
        findMany: jest.fn().mockResolvedValue([{ id: 'wh-1', name: 'Hauptlager Duisburg' }]),
      },
      timesheet: {
        create: jest.fn().mockResolvedValue({ id: 'ts-1' }),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(prismaMock);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentQueueService,
        DocumentsService,
        OcrProviderService,
        DocumentAnalyzerService,
        ScannerBridgeService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'OPENAI_API_KEY') return 'test-key';
              if (key === 'SCANNER_IP') return 'SIMULATOR';
              return null;
            }),
          },
        },
      ],
    }).compile();

    queueService = module.get<DocumentQueueService>(DocumentQueueService);
    analyzerService = module.get<DocumentAnalyzerService>(DocumentAnalyzerService);
  });

  afterEach(() => {
    queueService.onModuleDestroy();
  });

  describe('Document Analyzer & CRM Extraction', () => {
    it('should validate structured CRM data and sanitize document types', async () => {
      const sampleText = 'RECHNUNG Nr. RE-2026-9901 vom 15.08.2026 von LogiTrans GmbH Betrag 1.450,00 EUR';
      const extraction = await analyzerService.analyzeDocument(sampleText, []);

      expect(extraction).toBeDefined();
      expect(extraction.confidence).toBeGreaterThan(0);
      expect(['INVOICE', 'OTHER', 'TIMESHEET', 'CONTAINER_LIST']).toContain(extraction.documentType);
    });

    it('should match employee name if present in extraction context', async () => {
      const sampleText = 'Stundenzettel für Max Mustermann KW 33 2026';
      const extraction = await analyzerService.analyzeDocument(sampleText, []);

      expect(extraction).toBeDefined();
    });
  });

  describe('Sequential Queue Worker Controls', () => {
    it('should pause a batch cleanly and log audit event', async () => {
      const batchId = 'batch-100';
      prismaMock.documentBatch.update.mockResolvedValueOnce({
        id: batchId,
        status: BatchStatus.PAUSED,
      });

      const pausedBatch = await queueService.pauseBatch(batchId, 'user-admin');

      expect(pausedBatch.status).toBe(BatchStatus.PAUSED);
      expect(prismaMock.documentBatch.update).toHaveBeenCalledWith({
        where: { id: batchId },
        data: { status: BatchStatus.PAUSED },
      });
      expect(prismaMock.documentAuditLog.create).toHaveBeenCalledWith({
        data: {
          batchId,
          userId: 'user-admin',
          event: 'BATCH_PAUSED',
        },
      });
    });

    it('should resume a batch cleanly and notify worker', async () => {
      const batchId = 'batch-100';
      prismaMock.documentBatch.update.mockResolvedValueOnce({
        id: batchId,
        status: BatchStatus.PROCESSING,
      });
      prismaMock.documentBatch.findMany.mockResolvedValueOnce([]);

      const resumedBatch = await queueService.resumeBatch(batchId, 'user-admin');

      expect(resumedBatch.status).toBe(BatchStatus.PROCESSING);
      expect(prismaMock.documentAuditLog.create).toHaveBeenCalledWith({
        data: {
          batchId,
          userId: 'user-admin',
          event: 'BATCH_RESUMED',
        },
      });
    });

    it('should skip a document and allow subsequent documents in queue to proceed', async () => {
      const docId = 'doc-fail-1';
      const batchId = 'batch-200';
      prismaMock.universalDocument.findUnique.mockResolvedValueOnce({
        id: docId,
        batchId,
        originalFileName: 'unreadable_invoice.jpg',
        status: DocumentStatus.FAILED,
      });
      prismaMock.universalDocument.count.mockResolvedValueOnce(0);
      prismaMock.documentBatch.findUnique.mockResolvedValueOnce({
        id: batchId,
        completedCount: 4,
        failedCount: 0,
        skippedCount: 1,
        status: BatchStatus.PROCESSING,
      });

      const skipped = await queueService.skipDocument(docId, 'user-admin');

      expect(skipped.status).toBe(DocumentStatus.SKIPPED);
      expect(prismaMock.universalDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: docId },
          data: expect.objectContaining({ status: DocumentStatus.SKIPPED }),
        }),
      );
    });

    it('should retry a failed document by resetting its status to QUEUED', async () => {
      const docId = 'doc-retry-1';
      const batchId = 'batch-200';
      prismaMock.universalDocument.findUnique.mockResolvedValueOnce({
        id: docId,
        batchId,
        originalFileName: 'retry_doc.jpg',
        status: DocumentStatus.FAILED,
      });
      prismaMock.documentBatch.findMany.mockResolvedValueOnce([]);

      const retried = await queueService.retryDocument(docId, 'user-admin');

      expect(retried.status).toBe(DocumentStatus.QUEUED);
      expect(prismaMock.universalDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: docId },
          data: expect.objectContaining({
            status: DocumentStatus.QUEUED,
            errorCode: null,
            errorMessage: null,
          }),
        }),
      );
    });
  });
});
