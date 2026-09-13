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

@Module({
  imports: [
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
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
