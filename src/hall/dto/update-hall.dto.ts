import { IsOptional, IsString, IsInt, Min } from 'class-validator';

export class UpdateHallDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}
