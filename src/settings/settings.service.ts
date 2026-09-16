import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Subject, Observable } from 'rxjs';
import { Role } from '@prisma/client';

export const HIDE_WORK_HOURS_SETTING_KEY = 'HIDE_EMPLOYEE_WORK_HOURS';

export interface WorkHoursVisibilityEvent {
  type:
    | 'work_hours_visibility.employee_changed'
    | 'work_hours_visibility.bulk_changed'
    | 'work_hours_visibility.global_changed';
  employeeId?: string;
  employeeIds?: string[];
  hideWorkHours?: boolean;
  isGlobalHidden?: boolean;
  timestamp: string;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  // Subject for real-time Server-Sent Events (SSE)
  private readonly visibilityEventSubject = new Subject<WorkHoursVisibilityEvent>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns an Observable stream of real-time visibility events for SSE.
   */
  getVisibilityEventStream(): Observable<WorkHoursVisibilityEvent> {
    return this.visibilityEventSubject.asObservable();
  }

  /**
   * Emits a visibility event to all active SSE subscribers.
   */
  emitVisibilityEvent(event: WorkHoursVisibilityEvent) {
    try {
      this.visibilityEventSubject.next(event);
    } catch (err) {
      this.logger.error('Failed to emit visibility event', err);
    }
  }

  /**
   * External hook called e.g. when an employee is updated via UsersService.
   */
  notifyEmployeeVisibilityChanged(employeeId: string, hideWorkHours: boolean) {
    this.emitVisibilityEvent({
      type: 'work_hours_visibility.employee_changed',
      employeeId,
      hideWorkHours,
      timestamp: new Date().toISOString(),
    });
  }

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

    // Log the administrative action safely
    await this.recordActionLog(
      actorId,
      'UPDATE_SYSTEM_SETTING',
      `Arbeitszeit & Stundenzettel für Mitarbeiter: ${hideWorkHours ? 'AUSGEBLENDET (Gesperrt)' : 'SICHTBAR (Aktiv)'}`,
    );

    // Broadcast in real-time
    this.emitVisibilityEvent({
      type: 'work_hours_visibility.global_changed',
      isGlobalHidden: hideWorkHours,
      timestamp: new Date().toISOString(),
    });

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

  /**
   * Returns a list of all active employees and their individual hideWorkHours status.
   */
  async getAllEmployeesVisibility(): Promise<{
    isGlobalHidden: boolean;
    employees: Array<{
      id: string;
      name: string;
      username: string;
      phone: string | null;
      role: Role;
      isActive: boolean;
      hideWorkHours: boolean;
      warehouseName: string | null;
      hallName: string | null;
    }>;
  }> {
    const { isGlobalHidden } = await this.getWorkHoursVisibility();

    const employees = await this.prisma.user.findMany({
      where: {
        role: Role.EMPLOYEE,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        username: true,
        phone: true,
        role: true,
        isActive: true,
        hideWorkHours: true,
        warehouse: { select: { name: true } },
        hall: { select: { name: true } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return {
      isGlobalHidden,
      employees: employees.map((emp) => ({
        id: emp.id,
        name: emp.name,
        username: emp.username,
        phone: emp.phone,
        role: emp.role,
        isActive: emp.isActive,
        hideWorkHours: emp.hideWorkHours,
        warehouseName: emp.warehouse?.name || null,
        hallName: emp.hall?.name || null,
      })),
    };
  }

  /**
   * Sets individual hideWorkHours for a single employee and emits real-time event.
   */
  async setEmployeeWorkHoursVisibility(
    employeeId: string,
    hideWorkHours: boolean,
    actorId?: string,
  ): Promise<{ success: boolean; employeeId: string; hideWorkHours: boolean; message: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id: employeeId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`Mitarbeiter mit ID ${employeeId} nicht gefunden`);
    }

    const updated = await this.prisma.user.update({
      where: { id: employeeId },
      data: { hideWorkHours },
    });

    await this.recordActionLog(
      actorId,
      'UPDATE_EMPLOYEE_WORK_HOURS_VISIBILITY',
      `Arbeitszeit & Stundenzettel für ${updated.name} (${updated.username}): ${hideWorkHours ? 'AUSGEBLENDET' : 'SICHTBAR'}`,
    );

    // Broadcast real-time SSE event immediately
    this.emitVisibilityEvent({
      type: 'work_hours_visibility.employee_changed',
      employeeId,
      hideWorkHours,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      employeeId,
      hideWorkHours,
      message: hideWorkHours
        ? `Arbeitszeiten für ${updated.name} wurden ausgeblendet.`
        : `Arbeitszeiten für ${updated.name} sind nun sichtbar.`,
    };
  }

  /**
   * Sets hideWorkHours for multiple employees or all active employees at once.
   */
  async setBulkWorkHoursVisibility(
    employeeIds: string[] | undefined,
    hideWorkHours: boolean,
    actorId?: string,
  ): Promise<{ success: boolean; count: number; hideWorkHours: boolean; message: string }> {
    const whereClause: any = {
      role: Role.EMPLOYEE,
      deletedAt: null,
    };

    if (employeeIds && employeeIds.length > 0) {
      whereClause.id = { in: employeeIds };
    }

    const result = await this.prisma.user.updateMany({
      where: whereClause,
      data: { hideWorkHours },
    });

    await this.recordActionLog(
      actorId,
      'BULK_UPDATE_EMPLOYEE_WORK_HOURS_VISIBILITY',
      `Arbeitszeit & Stundenzettel für ${result.count} Mitarbeiter: ${hideWorkHours ? 'AUSGEBLENDET' : 'SICHTBAR'}`,
    );

    // Broadcast real-time SSE event immediately
    this.emitVisibilityEvent({
      type: 'work_hours_visibility.bulk_changed',
      employeeIds,
      hideWorkHours,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      count: result.count,
      hideWorkHours,
      message: hideWorkHours
        ? `Arbeitszeiten für ${result.count} Mitarbeiter wurden ausgeblendet.`
        : `Arbeitszeiten für ${result.count} Mitarbeiter sind nun sichtbar.`,
    };
  }

  /**
   * Safely records an administrative action in the ActionLog table without throwing on foreign key constraints.
   */
  private async recordActionLog(actorId: string | undefined, action: string, details: string) {
    try {
      let validActorId: string | null = null;
      if (actorId) {
        const actor = await this.prisma.user.findUnique({
          where: { id: actorId },
          select: { id: true },
        });
        if (actor) validActorId = actor.id;
      }
      await this.prisma.actionLog.create({
        data: {
          userId: validActorId,
          action,
          details,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to record action log for ${action}`, err);
    }
  }
}
