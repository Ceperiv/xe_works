import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ApiModule } from './api.module';
import { loadAppConfig } from './common/config/app-config';
import { AppLogger } from './common/logging/app-logger.service';
import { SeedService } from './modules/seed/seed.service';
import { SchedulerModule } from './scheduler.module';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const config = loadAppConfig();

  if (config.app.role === 'api') {
    const app = await NestFactory.create(ApiModule, {
      bufferLogs: true,
    });
    const logger = app.get(AppLogger);
    app.useLogger(logger);
    await app.get(SeedService).seed();
    await app.listen(config.app.port);
    logger.log({ event: 'api_started', port: config.app.port }, 'Bootstrap');
    return;
  }

  const module = config.app.role === 'worker' ? WorkerModule : SchedulerModule;
  const app = await NestFactory.createApplicationContext(module, {
    bufferLogs: true,
  });
  const logger = app.get(AppLogger);

  app.useLogger(logger);
  await app.get(SeedService).seed();
  logger.log({ event: 'context_started', role: config.app.role }, 'Bootstrap');
}

void bootstrap();
