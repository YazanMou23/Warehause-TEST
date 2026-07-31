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
import { OcrModule } from './ocr/ocr.module';
import { TelegramModule } from './telegram/telegram.module';
import { EmailModule } from './email/email.module';
import { MessagingModule } from './messaging/messaging.module';
import { ActionLogModule } from './action-log/action-log.module';
import { TimesheetModule } from './timesheet/timesheet.module';
import { ChatModule } from './chat/chat.module';
import { NotificationModule } from './notification/notification.module';
import { ScannerModule } from './scanner/scanner.module';

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
    OcrModule,
    TelegramModule,
    EmailModule,
    MessagingModule,
    ActionLogModule,
    TimesheetModule,
    ChatModule,
    NotificationModule,
    ScannerModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
