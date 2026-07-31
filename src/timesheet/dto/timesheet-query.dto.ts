import { IsOptional, IsString, IsEnum, IsNumberString } from 'class-validator';
import { TimesheetStatus } from '@prisma/client';

export class TimesheetQueryDto {
  @IsOptional()
  @IsEnum(TimesheetStatus)
  status?: TimesheetStatus;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string; // ISO date string YYYY-MM-DD

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
