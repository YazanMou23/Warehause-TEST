import { IsOptional, IsString, IsDateString, IsNumber, Min } from 'class-validator';

/**
 * Used with PATCH /timesheets/:timesheetId/entries/:entryId
 * All fields are optional — only the provided fields are updated.
 * If startTime or endTime change and totalHours is not provided,
 * the service will recalculate totalHours automatically.
 */
export class UpdateTimesheetEntryDto {
  @IsOptional()
  @IsString()
  weekday?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  /** HH:MM (24h format) */
  @IsOptional()
  @IsString()
  startTime?: string;

  /** HH:MM (24h format) */
  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  breakMinutes?: number;

  /**
   * If omitted and startTime/endTime are changed, totalHours is
   * recalculated automatically from the new times minus breakMinutes.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalHours?: number;

  @IsOptional()
  @IsString()
  location?: string;
}
