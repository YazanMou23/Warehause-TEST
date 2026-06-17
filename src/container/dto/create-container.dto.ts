import { IsEnum, IsNotEmpty, IsOptional, IsString, IsDateString } from 'class-validator';
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
}
