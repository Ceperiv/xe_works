import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { appConfig } from '../../common/config/app-config';
import { JOB_TYPES } from '../../common/constants';
import { AppLogger } from '../../common/logging/app-logger.service';
import { REDIS_CLIENT } from '../../common/rate-limit/redis.constants';
import { ApplicationEntity } from '../../database/entities';
import { IdempotentJobService } from '../queue/idempotent-job.service';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
    private readonly enqueueService: IdempotentJobService,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit(): void {
    if (this.config.app.role !== 'scheduler') {
      return;
    }

    this.timer = setInterval(() => {
      void this.runDueScans();
    }, this.config.scheduler.pollIntervalMs);

    void this.runDueScans();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runDueScans(): Promise<void> {
    const acquired = await this.redis.set(
      'lock:scheduler:scan',
      `${process.pid}`,
      'PX',
      this.config.scheduler.lockTtlMs,
      'NX',
    );

    if (acquired !== 'OK') {
      return;
    }

    try {
      await this.scheduleDueMarketplaceChecks();
      await this.scheduleDueAdsTxtChecks();
    } finally {
      await this.redis.del('lock:scheduler:scan');
    }
  }

  async scheduleDueMarketplaceChecks(cursorId = 0): Promise<number> {
    const now = new Date();
    const applications = await this.applicationRepository
      .createQueryBuilder('application')
      .where('application.nextMarketplaceCheckAt IS NOT NULL')
      .andWhere('application.nextMarketplaceCheckAt <= :now', { now: now.toISOString() })
      .andWhere('application.id > :cursorId', { cursorId })
      .orderBy('application.id', 'ASC')
      .limit(this.config.scheduler.batchSize)
      .getMany();

    if (!applications.length) {
      return 0;
    }

    for (const application of applications) {
      await this.enqueueService.enqueue(application.id, JOB_TYPES.marketplaceDiscovery, 'scheduler');
    }

    const lastId = applications[applications.length - 1]?.id ?? cursorId;
    const queued = applications.length;

    if (queued === this.config.scheduler.batchSize) {
      return queued + (await this.scheduleDueMarketplaceChecks(lastId));
    }

    this.logger.log(
      {
        event: 'scheduler_marketplace_batch',
        queued,
        lastId,
      },
      SchedulerService.name,
    );

    return queued;
  }

  async scheduleDueAdsTxtChecks(cursorId = 0): Promise<number> {
    const now = new Date();
    const applications = await this.applicationRepository
      .createQueryBuilder('application')
      .where('application.nextAdsTxtCheckAt IS NOT NULL')
      .andWhere('application.nextAdsTxtCheckAt <= :now', { now: now.toISOString() })
      .andWhere('application.id > :cursorId', { cursorId })
      .orderBy('application.id', 'ASC')
      .limit(this.config.scheduler.batchSize)
      .getMany();

    if (!applications.length) {
      return 0;
    }

    for (const application of applications) {
      await this.enqueueService.enqueue(application.id, JOB_TYPES.adsTxtFetch, 'scheduler');
    }

    const lastId = applications[applications.length - 1]?.id ?? cursorId;
    const queued = applications.length;

    if (queued === this.config.scheduler.batchSize) {
      return queued + (await this.scheduleDueAdsTxtChecks(lastId));
    }

    this.logger.log(
      {
        event: 'scheduler_ads_txt_batch',
        queued,
        lastId,
      },
      SchedulerService.name,
    );

    return queued;
  }
}
