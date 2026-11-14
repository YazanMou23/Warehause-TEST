import { WorkHoursModule } from './work-hours/work-hours.module';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { HallModule } from './hall/hall.module';
import { ContainerModule } from './container/container.module';
import { PlanningModule } from './planning/planning.module';
import { AttendanceModule } from './attendance/attendance.module';
import { EmailModule } from './email/email.module';
import { MessagingModule } from './messaging/messaging.module';
import { ActionLogModule } from './action-log/action-log.module';
import { TimesheetModule } from './timesheet/timesheet.module';
import { ChatModule } from './chat/chat.module';
import { NotificationModule } from './notification/notification.module';
import { DocumentsModule } from './documents/documents.module';
import { SettingsModule } from './settings/settings.module';
import { ContainerListsModule } from './container-lists/container-lists.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    WorkHoursModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    WarehouseModule,
    HallModule,
    ContainerModule,
    PlanningModule,
    AttendanceModule,
    EmailModule,
    MessagingModule,
    ActionLogModule,
    TimesheetModule,
    ChatModule,
    NotificationModule,
    DocumentsModule,
    SettingsModule,
    ContainerListsModule,
    // Global rate limiting: generous default per IP (Render sets X-Forwarded-For;
    // main.ts enables `trust proxy` so this tracks real clients). Sensitive
    // endpoints override with stricter @Throttle(...); Meta webhook endpoints
    // use @SkipThrottle() so inbound worker messages are never dropped.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // 1 minute window
        limit: 300, // generous default for the dashboard UI
      },
    ]),
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
