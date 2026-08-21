import { Controller, Get } from '@nestjs/common';
import { MetricsService } from '../../common/metrics/metrics.service';

@Controller('health')
export class HealthController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      metrics: this.metrics.getSnapshot(),
    };
  }
}
