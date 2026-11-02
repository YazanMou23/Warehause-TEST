import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { WhatsappSelfServiceService } from './whatsapp-self-service.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TimesheetModule } from '../timesheet/timesheet.module';

@Module({
  imports: [PrismaModule, TimesheetModule, ConfigModule],
  controllers: [MessagingController],
  providers: [MessagingService, WhatsappSelfServiceService],
  exports: [MessagingService, WhatsappSelfServiceService],
})
export class MessagingModule {}
