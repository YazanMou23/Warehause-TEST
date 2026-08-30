import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TimesheetController } from './timesheet.controller';
import { TimesheetService } from './timesheet.service';
import { TimesheetOcrService } from './timesheet-ocr.service';
import { TimesheetMatcherService } from './timesheet-matcher.service';
import { TimesheetExportService } from './timesheet-export.service';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 15 * 1024 * 1024, // 15 MB limit for high-res scans
      },
    }),
  ],
  controllers: [TimesheetController],
  providers: [
    TimesheetService,
    TimesheetOcrService,
    TimesheetMatcherService,
    TimesheetExportService,
  ],
  exports: [TimesheetService, TimesheetOcrService, TimesheetMatcherService],
})
export class TimesheetModule {}
