import { Module } from '@nestjs/common';
import { ScannerController } from './scanner.controller';
import { ScannerService } from './scanner.service';
import { TimesheetModule } from '../timesheet/timesheet.module';

@Module({
  imports: [
    TimesheetModule, // Provides TimesheetService (scan + OCR pipeline)
  ],
  controllers: [ScannerController],
  providers: [ScannerService],
})
export class ScannerModule {}
