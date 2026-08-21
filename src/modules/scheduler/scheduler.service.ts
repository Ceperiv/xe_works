import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { appConfig } from '../../common/config/app-config';
import { JOB_TYPES } from '../../common/constants';
import { AppLogger } from '../../common/logging/app-logger.service';
import { REDIS_CLIENT } from '../../common/rate-limit/redis.constants';
import { ApplicationEntity } from '../../database/entities';
import { IdempotentJobService } from '../queue/idempotent-job.service';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private static readonly LOCK_KEY = 'lock:scheduler:scan';

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
    const lockToken = randomUUID();
    const acquired = await this.acquireSchedulerLock(lockToken);

    if (!acquired) {
      return;
    }

    const heartbeat = this.startLockHeartbeat(lockToken);

    try {
      await this.scheduleDueMarketplaceChecks();
      await this.scheduleDueAdsTxtChecks();
    } finally {
      clearInterval(heartbeat);
      await this.releaseSchedulerLock(lockToken);
    }
  }

  async scheduleDueMarketplaceChecks(cursorId = 0): Promise<number> {
    const now = new Date().toISOString();
    let lastId = cursorId;
    let totalQueued = 0;

    while (true) {
      const applications = await this.applicationRepository
        .createQueryBuilder('application')
        .where('application.nextMarketplaceCheckAt IS NOT NULL')
        .andWhere('application.nextMarketplaceCheckAt <= :now', { now })
        .andWhere('application.id > :cursorId', { cursorId: lastId })
        .orderBy('application.id', 'ASC')
        .limit(this.config.scheduler.batchSize)
        .getMany();

      if (!applications.length) {
        return totalQueued;
      }

      for (const application of applications) {
        await this.enqueueService.enqueueIfNeeded(
          application.id,
          JOB_TYPES.marketplaceDiscovery,
          'scheduler',
        );
      }

      totalQueued += applications.length;
      lastId = applications[applications.length - 1]?.id ?? lastId;

      this.logger.log(
        {
          event: 'scheduler_marketplace_batch',
          queued: applications.length,
          lastId,
          totalQueued,
        },
        SchedulerService.name,
      );

      if (applications.length < this.config.scheduler.batchSize) {
        return totalQueued;
      }
    }
  }

  async scheduleDueAdsTxtChecks(cursorId = 0): Promise<number> {
    const now = new Date().toISOString();
    let lastId = cursorId;
    let totalQueued = 0;

    while (true) {
      const applications = await this.applicationRepository
        .createQueryBuilder('application')
        .where('application.nextAdsTxtCheckAt IS NOT NULL')
        .andWhere('application.nextAdsTxtCheckAt <= :now', { now })
        .andWhere('application.id > :cursorId', { cursorId: lastId })
        .orderBy('application.id', 'ASC')
        .limit(this.config.scheduler.batchSize)
        .getMany();

      if (!applications.length) {
        return totalQueued;
      }

      for (const application of applications) {
        await this.enqueueService.enqueueIfNeeded(application.id, JOB_TYPES.adsTxtFetch, 'scheduler');
      }

      totalQueued += applications.length;
      lastId = applications[applications.length - 1]?.id ?? lastId;

      this.logger.log(
        {
          event: 'scheduler_ads_txt_batch',
          queued: applications.length,
          lastId,
          totalQueued,
        },
        SchedulerService.name,
      );

      if (applications.length < this.config.scheduler.batchSize) {
        return totalQueued;
      }
    }
  }

  private async acquireSchedulerLock(lockToken: string): Promise<boolean> {
    const acquired = await this.redis.set(
      SchedulerService.LOCK_KEY,
      lockToken,
      'PX',
      this.config.scheduler.lockTtlMs,
      'NX',
    );

    return acquired === 'OK';
  }

  private startLockHeartbeat(lockToken: string): NodeJS.Timeout {
    const intervalMs = Math.max(1000, Math.floor(this.config.scheduler.lockTtlMs / 3));

    return setInterval(() => {
      void this.renewSchedulerLock(lockToken);
    }, intervalMs);
  }

  private async renewSchedulerLock(lockToken: string): Promise<void> {
    await this.redis.eval(
      `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      end
      return 0
      `,
      1,
      SchedulerService.LOCK_KEY,
      lockToken,
      `${this.config.scheduler.lockTtlMs}`,
    );
  }

  private async releaseSchedulerLock(lockToken: string): Promise<void> {
    await this.redis.eval(
      `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
      `,
      1,
      SchedulerService.LOCK_KEY,
      lockToken,
    );
  }
}
