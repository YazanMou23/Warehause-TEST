import { IsString, IsOptional, IsNumber, Min, IsDateString } from 'class-validator';

export class UpdateAttendanceDto {
  @IsDateString()
  clockIn: string;

  @IsOptional()
  @IsDateString()
  clockOut?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  breakMinutes: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalHours: number;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  hallId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
