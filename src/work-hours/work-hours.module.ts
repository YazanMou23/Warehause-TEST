import { Global, Module } from '@nestjs/common';
import { WorkHoursService } from './work-hours.service';
@Global()
@Module({ providers: [WorkHoursService], exports: [WorkHoursService] })
export class WorkHoursModule {}
