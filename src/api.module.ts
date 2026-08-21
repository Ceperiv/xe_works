import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { ApplicationsController } from './modules/applications/applications.controller';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [CoreModule],
  controllers: [ApplicationsController, HealthController],
})
export class ApiModule {}
