import { IsNotEmpty, IsOptional, IsString, IsNumber } from 'class-validator';

export class EmployeeSegmentDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsNotEmpty()
  @IsString()
  treffpunkt: string;

  @IsOptional()
  @IsString()
  treffpunktTime?: string;

  @IsNotEmpty()
  @IsString()
  startTime: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  order?: number;
}
