import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class QrScanDto {
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsString()
  @IsNotEmpty()
  hallId: string;

  @IsString()
  @IsOptional()
  employeeId?: string;
}
