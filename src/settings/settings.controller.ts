import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

import { IsBoolean } from 'class-validator';

export class UpdateWorkHoursVisibilityDto {
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
}
