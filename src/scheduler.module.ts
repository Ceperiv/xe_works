import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { SchedulerService } from './modules/scheduler/scheduler.service';

@Module({
  imports: [CoreModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
