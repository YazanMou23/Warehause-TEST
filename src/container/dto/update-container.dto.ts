import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ContainerStatus } from '@prisma/client';

export class UpdateContainerDto {
  @IsOptional()
  @IsEnum(ContainerStatus)
  status?: ContainerStatus;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  hallId?: string;
}
