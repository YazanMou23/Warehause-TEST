import { IsNotEmpty, IsString } from 'class-validator';

export class BroadcastDto {
  @IsNotEmpty()
  @IsString()
  message: string;
}

export class EmergencyDto {
  @IsNotEmpty()
  @IsString()
  warehouseId: string;

  @IsNotEmpty()
  @IsString()
  message: string;
}

export class ReminderDto {
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @IsNotEmpty()
  @IsString()
  message: string;
}
