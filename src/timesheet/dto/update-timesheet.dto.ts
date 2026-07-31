import { IsOptional, IsString, IsDateString } from 'class-validator';

/**
 * Used with PATCH /timesheets/:id
 * Allows editing header fields of a PENDING_REVIEW timesheet after OCR scan.
 */
export class UpdateTimesheetDto {
  @IsOptional()
  @IsString()
  employeeName?: string;

  @IsOptional()
  @IsDateString()
  weekStartDate?: string;
}
