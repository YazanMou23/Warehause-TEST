import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsDateString,
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
  @IsString()
  weekday: string;

  @IsDateString()
  date: string;

  @IsString()
  startTime: string; // HH:MM

  @IsString()
  endTime: string; // HH:MM

  @IsNumber()
  @Min(0)
  breakMinutes: number;

  @IsNumber()
  @Min(0)
  totalHours: number;

  @IsOptional()
  @IsString()
  location?: string;
}

export class ConfirmTimesheetDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  /**
   * If set, a new Employee user will be created and linked to this timesheet.
   * Either employeeId or createNewEmployee must be provided.
   */
  @ValidateIf((o) => !o.employeeId)
  @ValidateNested()
  @Type(() => NewEmployeeDto)
  createNewEmployee?: NewEmployeeDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimesheetEntryInputDto)
  entries: TimesheetEntryInputDto[];
}
