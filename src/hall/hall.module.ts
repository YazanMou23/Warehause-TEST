import { Module } from '@nestjs/common';
import { HallService } from './hall.service';
import { HallController } from './hall.controller';

@Module({
  controllers: [HallController],
  providers: [HallService],
  exports: [HallService],
})
export class HallModule {}
