import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { JobState, Queue } from 'bullmq';
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

  async enqueueIfNeeded(
    applicationId: number,
    type: JobType,
    triggeredBy: ScrapingQueuePayload['triggeredBy'],
  ): Promise<boolean> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
    });

    if (!application) {
      return false;
    }

    const scheduledAt = new Date();
    const jobId = buildScrapingJobId(applicationId, type);
    const queue = type === JOB_TYPES.marketplaceDiscovery ? this.marketplaceQueue : this.adsTxtQueue;
    const existingState = await this.scrapingJobRepository.findOne({
      where: { applicationId, type },
    });
    const bullJob = await queue.getJob(jobId);
    const bullState = bullJob ? await bullJob.getState() : null;

    if (!this.shouldEnqueue(existingState, bullState, triggeredBy)) {
      this.logger.log(
        {
          event: 'queue_job_skipped',
          applicationId,
          type,
          triggeredBy,
          jobId,
          currentStatus: existingState?.status ?? null,
          bullState,
        },
        IdempotentJobService.name,
      );
      return false;
    }

    await this.upsertSchedulingState(applicationId, type, scheduledAt, existingState);

    const payload: ScrapingQueuePayload = {
      applicationId,
      type,
      triggeredBy,
      scheduledAt: scheduledAt.toISOString(),
    };

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

  async forceEnqueue(
    applicationId: number,
    type: JobType,
    triggeredBy: ScrapingQueuePayload['triggeredBy'],
  ): Promise<boolean> {
    const queue = type === JOB_TYPES.marketplaceDiscovery ? this.marketplaceQueue : this.adsTxtQueue;
    const jobId = buildScrapingJobId(applicationId, type);
    const bullJob = await queue.getJob(jobId);
    const bullState = bullJob ? await bullJob.getState() : null;

    if (bullJob && this.isQueueStateBusy(bullState)) {
      return false;
    }

    if (bullJob) {
      await bullJob.remove().catch(() => undefined);
    }

    const scheduledAt = new Date();
    const existingState = await this.scrapingJobRepository.findOne({
      where: { applicationId, type },
    });

    await this.upsertSchedulingState(applicationId, type, scheduledAt, existingState, true);

    const payload: ScrapingQueuePayload = {
      applicationId,
      type,
      triggeredBy,
      scheduledAt: scheduledAt.toISOString(),
    };

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
        event: 'queue_job_force_enqueued',
        applicationId,
        type,
        triggeredBy,
        jobId,
      },
      IdempotentJobService.name,
    );

    return true;
  }

  private shouldEnqueue(
    existingState: ScrapingJobEntity | null,
    bullState: JobState | null,
    triggeredBy: ScrapingQueuePayload['triggeredBy'],
  ): boolean {
    if (!existingState) {
      return true;
    }

    if (this.isQueueStateBusy(bullState)) {
      return false;
    }

    if (existingState.status === SCRAPING_JOB_STATUS.running && !this.isStaleRunningJob(existingState)) {
      return false;
    }

    if (
      existingState.status === SCRAPING_JOB_STATUS.succeeded &&
      triggeredBy === 'scheduler'
    ) {
      return false;
    }

    return true;
  }

  private async upsertSchedulingState(
    applicationId: number,
    type: JobType,
    scheduledAt: Date,
    existingState: ScrapingJobEntity | null,
    force = false,
  ): Promise<void> {
    if (!existingState) {
      try {
        await this.scrapingJobRepository.insert({
          applicationId,
          type,
          status: SCRAPING_JOB_STATUS.scheduled,
          attempts: 0,
          scheduledAt,
          startedAt: null,
          finishedAt: null,
          error: null,
        });
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          return;
        }

        throw error;
      }

      return;
    }

    if (
      force ||
      existingState.status === SCRAPING_JOB_STATUS.failed ||
      existingState.status === SCRAPING_JOB_STATUS.deadLetter ||
      existingState.status === SCRAPING_JOB_STATUS.retrying ||
      existingState.status === SCRAPING_JOB_STATUS.succeeded ||
      this.isStaleRunningJob(existingState)
    ) {
      await this.scrapingJobRepository.update(
        { applicationId, type },
        {
          status: SCRAPING_JOB_STATUS.scheduled,
          scheduledAt,
          error: null,
          startedAt: null,
          finishedAt: null,
        },
      );
    }
  }

  private isQueueStateBusy(state: JobState | null): boolean {
    return state === 'active' || state === 'waiting' || state === 'delayed' || state === 'prioritized';
  }

  private isStaleRunningJob(job: ScrapingJobEntity): boolean {
    if (job.status !== SCRAPING_JOB_STATUS.running || !job.startedAt) {
      return false;
    }

    const staleAfterMs = Math.max(
      60_000,
      this.config.queue.backoffMs * this.config.queue.attempts +
        2 * this.config.queue.backoffMs,
    );

    return job.startedAt.getTime() + staleAfterMs < Date.now();
  }
}
