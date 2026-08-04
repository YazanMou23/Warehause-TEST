import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class LocationDto {
  @IsNotEmpty()
  @IsString()
  warehouseId: string;

  @IsNotEmpty()
  @IsString()
  hallId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePlanDto {
  @IsNotEmpty()
  @IsDateString()
  date: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  hallId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocationDto)
  locations?: LocationDto[];

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  shift?: string;

  @IsOptional()
  @IsString()
  treffpunkt?: string;

  @IsOptional()
  @IsString()
  treffpunktTime?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedEmployeeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedContainerIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedContainerNumbers?: string[];
}

