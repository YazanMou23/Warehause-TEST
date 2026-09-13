import { IsEnum, IsNotEmpty, IsOptional, IsString, IsEmail, IsBoolean } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  username: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  phone: string;

  @IsNotEmpty()
  @IsString()
  passwordHash: string; // Will be passed as raw password, then hashed.

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  hallId?: string;

  @IsOptional()
  @IsString()
  telegramId?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  treffpunkt?: string;

  @IsOptional()
  @IsString()
  treffpunktTime?: string;

  @IsOptional()
  @IsString()
  employmentStart?: string;

  @IsOptional()
  @IsString()
  employmentEnd?: string;

  @IsOptional()
  @IsBoolean()
  hideWorkHours?: boolean;
}
