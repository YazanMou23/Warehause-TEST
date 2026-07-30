import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdatePlanDto {
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
