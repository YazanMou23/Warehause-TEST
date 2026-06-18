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
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
