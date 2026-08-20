import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AbsenceStatus } from '@prisma/client';

export class SetEmployeeAbsenceDto {
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @IsNotEmpty()
  @IsString()
  date: string;

  @IsNotEmpty()
  @IsEnum(AbsenceStatus)
  status: AbsenceStatus;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryEmployeeAbsenceDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;
}
