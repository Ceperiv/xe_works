import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../common/constants';
import { AppLogger } from '../../common/logging/app-logger.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { AdsTxtFetcher } from '../ads-txt/ads-txt.fetcher';
import { ScrapingQueuePayload } from './queue.types';

@Processor(QUEUE_NAMES.adsTxtFetch, {
  concurrency: Number.parseInt(process.env.ADS_TXT_CONCURRENCY ?? '25', 10),
})
export class AdsTxtProcessor extends WorkerHost {
  constructor(
    private readonly adsTxtFetcher: AdsTxtFetcher,
    private readonly logger: AppLogger,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<ScrapingQueuePayload>): Promise<void> {
    const startedAt = Date.now();
    const runId = `${QUEUE_NAMES.adsTxtFetch}:${job.id}`;
    await this.adsTxtFetcher.fetch(job.data.applicationId, runId);
    this.metrics.increment('jobs_processed_total', { queue: QUEUE_NAMES.adsTxtFetch, result: 'success' });
    this.logger.log(
      {
        event: 'ads_txt_job_processed',
        runId,
        jobId: job.id,
        applicationId: job.data.applicationId,
        durationMs: Date.now() - startedAt,
      },
      AdsTxtProcessor.name,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ScrapingQueuePayload>, error: Error): void {
    this.metrics.increment('jobs_processed_total', { queue: QUEUE_NAMES.adsTxtFetch, result: 'failed' });
    this.logger.error(
      {
        event: 'ads_txt_job_failed',
        runId: `${QUEUE_NAMES.adsTxtFetch}:${job?.id}`,
        jobId: job?.id,
        applicationId: job?.data.applicationId,
        attemptsMade: job?.attemptsMade,
      },
      error.stack,
      AdsTxtProcessor.name,
    );
  }
}
