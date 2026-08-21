import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { appConfig } from '../../common/config/app-config';
import { JOB_TYPES, JobType, QUEUE_NAMES, SCRAPING_JOB_STATUS } from '../../common/constants';
import { AppLogger } from '../../common/logging/app-logger.service';
import { buildScrapingJobId } from './job-id.util';
import { ScrapingQueuePayload } from './queue.types';
import { ApplicationEntity, ScrapingJobEntity } from '../../database/entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class IdempotentJobService {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    @InjectQueue(QUEUE_NAMES.marketplaceDiscovery)
    private readonly marketplaceQueue: Queue<ScrapingQueuePayload>,
    @InjectQueue(QUEUE_NAMES.adsTxtFetch)
    private readonly adsTxtQueue: Queue<ScrapingQueuePayload>,
    @InjectRepository(ScrapingJobEntity)
    private readonly scrapingJobRepository: Repository<ScrapingJobEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
    private readonly logger: AppLogger,
  ) {}

  async enqueue(applicationId: number, type: JobType, triggeredBy: ScrapingQueuePayload['triggeredBy']): Promise<boolean> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
    });

    if (!application) {
      return false;
    }

    const scheduledAt = new Date();
    const jobId = buildScrapingJobId(applicationId, type);

    await this.scrapingJobRepository.upsert(
      {
        applicationId,
        type,
        status: SCRAPING_JOB_STATUS.scheduled,
        attempts: 0,
        scheduledAt,
        startedAt: null,
        finishedAt: null,
        error: null,
      },
      ['applicationId', 'type'],
    );

    const payload: ScrapingQueuePayload = {
      applicationId,
      type,
      triggeredBy,
      scheduledAt: scheduledAt.toISOString(),
    };

    const queue = type === JOB_TYPES.marketplaceDiscovery ? this.marketplaceQueue : this.adsTxtQueue;

    await queue.add(type, payload, {
      jobId,
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: this.config.queue.attempts,
      backoff: {
        type: 'exponential',
        delay: this.config.queue.backoffMs,
      },
    });

    this.logger.log(
      {
        event: 'queue_job_enqueued',
        applicationId,
        type,
        triggeredBy,
        jobId,
      },
      IdempotentJobService.name,
    );

    return true;
  }
}
