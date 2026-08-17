import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentQueueService } from './document-queue.service';
import { OcrProviderService } from './ocr-provider.service';
import { DocumentAnalyzerService } from './document-analyzer.service';
import { ScannerBridgeService } from './scanner-bridge.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentQueueService,
    OcrProviderService,
    DocumentAnalyzerService,
    ScannerBridgeService,
  ],
  exports: [
    DocumentsService,
    DocumentQueueService,
    OcrProviderService,
    DocumentAnalyzerService,
    ScannerBridgeService,
  ],
})
export class DocumentsModule {}
