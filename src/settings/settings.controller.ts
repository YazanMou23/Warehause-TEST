import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  Sse,
} from '@nestjs/common';
import { SettingsService, WorkHoursVisibilityEvent } from './settings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { IsBoolean, IsOptional, IsArray } from 'class-validator';
import { Observable, merge, interval } from 'rxjs';
import { map } from 'rxjs/operators';

export class UpdateWorkHoursVisibilityDto {
  @IsBoolean()
  hideWorkHours: boolean;
}

export class UpdateEmployeeVisibilityDto {
  @IsBoolean()
  hideWorkHours: boolean;
}

export class BulkUpdateEmployeeVisibilityDto {
  @IsOptional()
  @IsArray()
  employeeIds?: string[];

  @IsBoolean()
  hideWorkHours: boolean;
}

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * GET /settings/work-hours-visibility
   * Read the global visibility status (accessible by all authenticated users)
   */
  @Get('work-hours-visibility')
  async getWorkHoursVisibility() {
    return this.settingsService.getWorkHoursVisibility();
  }

  /**
   * PATCH /settings/work-hours-visibility
   * Toggle the global visibility of work hours and timesheets.
   * Strictly restricted to ADMIN and MANAGER.
   */
  @Patch('work-hours-visibility')
  @Roles(Role.MANAGER, Role.ADMIN)
  async setWorkHoursVisibility(
    @Body() body: UpdateWorkHoursVisibilityDto,
    @CurrentUser() currentUser: any,
  ) {
    if (typeof body.hideWorkHours !== 'boolean') {
      throw new BadRequestException('Field "hideWorkHours" must be a boolean');
    }
    return this.settingsService.setWorkHoursVisibility(
      body.hideWorkHours,
      currentUser.id,
    );
  }

  /**
   * GET /settings/work-hours-visibility/employees
   * List all active employees with their individual hideWorkHours status.
   * Strictly restricted to ADMIN and MANAGER.
   */
  @Get('work-hours-visibility/employees')
  @Roles(Role.MANAGER, Role.ADMIN)
  async getAllEmployeesVisibility() {
    return this.settingsService.getAllEmployeesVisibility();
  }

  /**
   * PATCH /settings/work-hours-visibility/employee/:id
   * Toggle the individual work hours visibility for a specific employee.
   * Strictly restricted to ADMIN and MANAGER.
   */
  @Patch('work-hours-visibility/employee/:id')
  @Roles(Role.MANAGER, Role.ADMIN)
  async setEmployeeWorkHoursVisibility(
    @Param('id') id: string,
    @Body() body: UpdateEmployeeVisibilityDto,
    @CurrentUser() currentUser: any,
  ) {
    if (typeof body.hideWorkHours !== 'boolean') {
      throw new BadRequestException('Field "hideWorkHours" must be a boolean');
    }
    return this.settingsService.setEmployeeWorkHoursVisibility(
      id,
      body.hideWorkHours,
      currentUser.id,
    );
  }

  /**
   * PATCH /settings/work-hours-visibility/bulk
   * Bulk toggle work hours visibility for selected or all active employees.
   * Strictly restricted to ADMIN and MANAGER.
   */
  @Patch('work-hours-visibility/bulk')
  @Roles(Role.MANAGER, Role.ADMIN)
  async setBulkWorkHoursVisibility(
    @Body() body: BulkUpdateEmployeeVisibilityDto,
    @CurrentUser() currentUser: any,
  ) {
    if (typeof body.hideWorkHours !== 'boolean') {
      throw new BadRequestException('Field "hideWorkHours" must be a boolean');
    }
    return this.settingsService.setBulkWorkHoursVisibility(
      body.employeeIds,
      body.hideWorkHours,
      currentUser.id,
    );
  }

  /**
   * GET /settings/work-hours-visibility/events
   * Real-time Server-Sent Events (SSE) stream for instant UI updates when
   * an admin/manager changes work hours visibility for an employee or globally.
   * Publicly connectable by browser EventSource.
   */
  @Public()
  @Sse('work-hours-visibility/events')
  streamVisibilityEvents(): Observable<{ data: WorkHoursVisibilityEvent | { type: string; timestamp: string } }> {
    // Merge live visibility events with a 25-second keepalive heartbeat
    const liveEvents$ = this.settingsService
      .getVisibilityEventStream()
      .pipe(map((event) => ({ data: event })));

    const heartbeat$ = interval(25000).pipe(
      map(() => ({
        data: {
          type: 'ping',
          timestamp: new Date().toISOString(),
        },
      })),
    );

    return merge(liveEvents$, heartbeat$);
  }
}
