import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../common/constants';
import { AppLogger } from '../../common/logging/app-logger.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { ScrapingQueuePayload } from './queue.types';

@Processor(QUEUE_NAMES.marketplaceDiscovery, {
  concurrency: Number.parseInt(process.env.MARKETPLACE_CONCURRENCY ?? '10', 10),
})
export class MarketplaceProcessor extends WorkerHost {
  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly logger: AppLogger,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<ScrapingQueuePayload>): Promise<void> {
    const startedAt = Date.now();
    const runId = `${QUEUE_NAMES.marketplaceDiscovery}:${job.id}`;
    await this.marketplaceService.refreshApplication(job.data.applicationId, runId);
    this.metrics.increment('jobs_processed_total', { queue: QUEUE_NAMES.marketplaceDiscovery, result: 'success' });
    this.logger.log(
      {
        event: 'marketplace_job_processed',
        runId,
        jobId: job.id,
        applicationId: job.data.applicationId,
        durationMs: Date.now() - startedAt,
      },
      MarketplaceProcessor.name,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ScrapingQueuePayload>, error: Error): void {
    this.metrics.increment('jobs_processed_total', { queue: QUEUE_NAMES.marketplaceDiscovery, result: 'failed' });
    this.logger.error(
      {
        event: 'marketplace_job_failed',
        runId: `${QUEUE_NAMES.marketplaceDiscovery}:${job?.id}`,
        jobId: job?.id,
        applicationId: job?.data.applicationId,
        attemptsMade: job?.attemptsMade,
      },
      error.stack,
      MarketplaceProcessor.name,
    );
  }
}
