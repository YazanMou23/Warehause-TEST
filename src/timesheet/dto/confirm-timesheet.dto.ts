import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsDateString,
  IsBoolean,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class NewEmployeeDto {
  @IsString()
  name: string;

  @IsString()
  username: string;

  @IsString()
  phone: string;

  @IsString()
  password: string;
}

export class TimesheetEntryInputDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  timesheetId?: string;

  @IsString()
  weekday: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  startTime?: string; // HH:MM (optional for inactive days)

  @IsOptional()
  @IsString()
  endTime?: string; // HH:MM (optional if open shift)

  @IsOptional()
  @IsNumber()
  @Min(0)
  breakMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalHours?: number;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ConfirmTimesheetDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  employeeName?: string;

  @IsOptional()
  @IsDateString()
  weekStartDate?: string;

  /**
   * If set, a new Employee user will be created and linked to this timesheet.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => NewEmployeeDto)
  createNewEmployee?: NewEmployeeDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimesheetEntryInputDto)
  entries: TimesheetEntryInputDto[];
}
