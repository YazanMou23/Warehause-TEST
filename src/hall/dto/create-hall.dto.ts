import { IsNotEmpty, IsOptional, IsString, IsInt, Min } from 'class-validator';

export class CreateHallDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  warehouseId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}
