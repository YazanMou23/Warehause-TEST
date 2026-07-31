import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { OcrService } from './ocr.service';
import { OcrController } from './ocr.controller';
import { TimesheetModule } from '../timesheet/timesheet.module';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 15 * 1024 * 1024, // 15 MB — increased to match timesheet module
      },
    }),
    TimesheetModule, // provides TimesheetMatcherService + TimesheetOcrService
  ],
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
