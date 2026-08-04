import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';
import { LocationDto } from './create-plan.dto';

export class UpdatePlanDto {
  @IsOptional()
  @IsDateString()
  date?: string;

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

