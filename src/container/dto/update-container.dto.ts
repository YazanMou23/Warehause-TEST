import { IsEnum, IsOptional, IsString, IsNumber, IsArray } from 'class-validator';
import { ContainerStatus } from '@prisma/client';

export class UpdateContainerDto {
  @IsOptional()
  @IsString()
  containerNumber?: string;

  @IsOptional()
  @IsEnum(ContainerStatus)
  status?: ContainerStatus;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  hallId?: string;

  @IsOptional()
  @IsNumber()
  workedHours?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedEmployeeIds?: string[];
}
