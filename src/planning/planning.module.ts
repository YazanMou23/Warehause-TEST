import { Module } from '@nestjs/common';
import { PlanningService } from './planning.service';
import { PlanningController } from './planning.controller';
import { EmailModule } from '../email/email.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [EmailModule, MessagingModule],
  controllers: [PlanningController],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
