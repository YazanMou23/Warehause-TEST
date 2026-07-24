import { IsOptional, IsString, IsInt, Min } from 'class-validator';

export class UpdateHallDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  color?: string;
}

