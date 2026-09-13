import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const HIDE_WORK_HOURS_SETTING_KEY = 'HIDE_EMPLOYEE_WORK_HOURS';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves whether employee work hours and timesheet entries are globally hidden.
   */
  async getWorkHoursVisibility(): Promise<{ isGlobalHidden: boolean }> {
    try {
      const setting = await this.prisma.systemSetting.findUnique({
        where: { key: HIDE_WORK_HOURS_SETTING_KEY },
      });
      return {
        isGlobalHidden: setting ? setting.value === 'true' : false,
      };
    } catch (error) {
      this.logger.error('Failed to get work hours visibility setting', error);
      return { isGlobalHidden: false };
    }
  }

  /**
   * Sets whether employee work hours and timesheet entries are globally hidden.
   * Only accessible by ADMIN and MANAGER roles.
   */
  async setWorkHoursVisibility(
    hideWorkHours: boolean,
    actorId?: string,
  ): Promise<{ success: boolean; isGlobalHidden: boolean; message: string }> {
    const stringValue = hideWorkHours ? 'true' : 'false';

    await this.prisma.systemSetting.upsert({
      where: { key: HIDE_WORK_HOURS_SETTING_KEY },
      update: { value: stringValue },
      create: {
        key: HIDE_WORK_HOURS_SETTING_KEY,
        value: stringValue,
      },
    });

    // Log the administrative action
    try {
      await this.prisma.actionLog.create({
        data: {
          userId: actorId || null,
          action: 'UPDATE_SYSTEM_SETTING',
          details: `Arbeitszeit & Stundenzettel für Mitarbeiter: ${hideWorkHours ? 'AUSGEBLENDET (Gesperrt)' : 'SICHTBAR (Aktiv)'}`,
        },
      });
    } catch (logErr) {
      this.logger.warn('Failed to record ActionLog for system setting update', logErr);
    }

    return {
      success: true,
      isGlobalHidden: hideWorkHours,
      message: hideWorkHours
        ? 'Arbeitszeit und Stundenzettel-Erfassungen sind nun für alle Mitarbeiter ausgeblendet.'
        : 'Arbeitszeit und Stundenzettel-Erfassungen sind nun für Mitarbeiter sichtbar.',
    };
  }

  /**
   * Helper to check if work hours are hidden for a specific user.
   * True if either the global setting is active OR the user has hideWorkHours=true.
   */
  async isWorkHoursHiddenForEmployee(employeeId: string): Promise<boolean> {
    const { isGlobalHidden } = await this.getWorkHoursVisibility();
    if (isGlobalHidden) return true;

    const user = await this.prisma.user.findUnique({
      where: { id: employeeId },
      select: { hideWorkHours: true },
    });

    return user?.hideWorkHours ?? false;
  }
}
