import { IsEnum, IsNotEmpty, IsOptional, IsString, IsDateString, IsNumber, IsArray } from 'class-validator';
import { ContainerStatus } from '@prisma/client';

export class CreateContainerDto {
  @IsNotEmpty()
  @IsString()
  containerNumber: string;

  @IsNotEmpty()
  @IsEnum(ContainerStatus)
  status: ContainerStatus;

  @IsNotEmpty()
  @IsString()
  warehouseId: string;

  @IsNotEmpty()
  @IsString()
  hallId: string;

  @IsOptional()
  @IsDateString()
  arrivalDate?: string;

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
