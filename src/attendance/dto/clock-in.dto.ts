import { IsNotEmpty, IsString } from 'class-validator';

export class ClockInDto {
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @IsNotEmpty()
  @IsString()
  warehouseId: string;

  @IsNotEmpty()
  @IsString()
  hallId: string;
}
