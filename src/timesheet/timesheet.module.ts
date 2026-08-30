import { Module } from '@nestjs/common';
import { TimesheetController } from './timesheet.controller';
import { TimesheetService } from './timesheet.service';
import { TimesheetExportService } from './timesheet-export.service';

@Module({
  controllers: [TimesheetController],
  providers: [
    TimesheetService,
    TimesheetExportService,
  ],
  exports: [TimesheetService, TimesheetExportService],
})
export class TimesheetModule {}
