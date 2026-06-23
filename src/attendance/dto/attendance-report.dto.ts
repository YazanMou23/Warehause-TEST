import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';

export class AttendanceReportDto {
  @IsEnum(['daily', 'weekly', 'monthly'])
  timeframe: 'daily' | 'weekly' | 'monthly';

  @IsOptional()
  @IsDateString()
  date?: string; // YYYY-MM-DD for daily

  @IsOptional()
  @IsString()
  week?: string; // Calendar week (KW) number

  @IsOptional()
  @IsString()
  month?: string; // Month number (1-12)

  @IsString()
  year: string; // e.g. 2026

  @IsOptional()
  @IsString()
  employeeId?: string; // Filter by employee
}
