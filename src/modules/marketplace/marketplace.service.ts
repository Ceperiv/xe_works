import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  APPLICATION_STATUS,
  JOB_TYPES,
  MARKETPLACE,
  SCRAPING_JOB_STATUS,
} from '../../common/constants';
import { ScraperError, isRetryableErrorCode } from '../../common/errors/scraper-error';
import { AppLogger } from '../../common/logging/app-logger.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { ApplicationEntity, PublisherEntity, ScrapingJobEntity } from '../../database/entities';
import { IdempotentJobService } from '../queue/idempotent-job.service';
import { normalizeDomain } from '../ads-txt/domain.utils';
import { MarketplaceProviderRegistry } from './marketplace-provider.registry';

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly providerRegistry: MarketplaceProviderRegistry,
    private readonly enqueueService: IdempotentJobService,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
    @InjectRepository(PublisherEntity)
    private readonly publisherRepository: Repository<PublisherEntity>,
    @InjectRepository(ScrapingJobEntity)
    private readonly scrapingJobRepository: Repository<ScrapingJobEntity>,
    private readonly logger: AppLogger,
    private readonly metrics: MetricsService,
  ) {}

  async refreshApplication(applicationId: number, runId = `marketplace-${applicationId}`): Promise<void> {
    const startedAt = Date.now();
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: ['publisher'],
    });

    if (!application) {
      return;
    }

    const provider = this.providerRegistry.getProvider(application.marketplace);

    await this.markJobRunning(applicationId, JOB_TYPES.marketplaceDiscovery);

    try {
      const discovered = await provider.findApplication(application.bundleId);
      const now = new Date();

      if (!discovered) {
        application.status = APPLICATION_STATUS.notFound;
        application.lastMarketplaceCheckAt = now;
        application.nextMarketplaceCheckAt = this.addDays(now, 7);
        await this.applicationRepository.save(application);
        await this.markJobFinished(applicationId, JOB_TYPES.marketplaceDiscovery, SCRAPING_JOB_STATUS.succeeded);
        return;
      }

      let publisher: PublisherEntity | null = null;
      let normalizedDomain: string | null = null;

      if (discovered.publisherDomain) {
        normalizedDomain = normalizeDomain(discovered.publisherDomain);
        publisher =
          (await this.publisherRepository.findOne({ where: { domain: normalizedDomain } })) ??
          (await this.publisherRepository.save(
            this.publisherRepository.create({
              name: discovered.publisherName,
              domain: normalizedDomain,
            }),
          ));
      }

      application.name = discovered.name;
      application.publisher = publisher;
      application.publisherId = publisher?.id ?? null;
      application.publisherDomain = normalizedDomain;
      application.marketplaceUrl = discovered.marketplaceUrl;
      application.status = discovered.removed ? APPLICATION_STATUS.removed : APPLICATION_STATUS.active;
      application.lastMarketplaceCheckAt = now;
      application.nextMarketplaceCheckAt = this.addDays(now, 7);
      application.nextAdsTxtCheckAt = now;

      await this.applicationRepository.save(application);
      await this.markJobFinished(applicationId, JOB_TYPES.marketplaceDiscovery, SCRAPING_JOB_STATUS.succeeded);

      this.metrics.increment('marketplace_refresh_total', {
        marketplace: application.marketplace,
        result: discovered.removed ? 'removed' : 'found',
      });
      this.logger.log(
        {
          event: 'marketplace_refresh_succeeded',
          runId,
          applicationId,
          publisherDomain: application.publisherDomain,
          durationMs: Date.now() - startedAt,
        },
        MarketplaceService.name,
      );

      if (application.publisherDomain) {
        await this.enqueueService.enqueue(applicationId, JOB_TYPES.adsTxtFetch, 'worker');
      }
    } catch (error) {
      const classified =
        error instanceof ScraperError ? error : new ScraperError('Temporary', 'Marketplace refresh failed');

      application.status = isRetryableErrorCode(classified.code)
        ? APPLICATION_STATUS.marketplaceFailed
        : APPLICATION_STATUS.notFound;
      application.lastMarketplaceCheckAt = new Date();
      application.nextMarketplaceCheckAt = this.addHours(new Date(), 6);

      await this.applicationRepository.save(application);
      await this.markJobFinished(
        applicationId,
        JOB_TYPES.marketplaceDiscovery,
        isRetryableErrorCode(classified.code)
          ? SCRAPING_JOB_STATUS.failed
          : SCRAPING_JOB_STATUS.deadLetter,
        classified.message,
      );

      this.metrics.increment('marketplace_refresh_errors_total', {
        code: classified.code,
      });

      this.logger.error(
        {
          event: 'marketplace_refresh_failed',
          runId,
          applicationId,
          bundleId: application.bundleId,
          code: classified.code,
          durationMs: Date.now() - startedAt,
        },
        classified.stack,
        MarketplaceService.name,
      );

      throw classified;
    }
  }

  private async markJobRunning(applicationId: number, type: typeof JOB_TYPES.marketplaceDiscovery): Promise<void> {
    await this.scrapingJobRepository.increment({ applicationId, type }, 'attempts', 1);
    await this.scrapingJobRepository.update(
      { applicationId, type },
      { status: SCRAPING_JOB_STATUS.running, startedAt: new Date() },
    );
  }

  private async markJobFinished(
    applicationId: number,
    type: typeof JOB_TYPES.marketplaceDiscovery,
    status: typeof SCRAPING_JOB_STATUS[keyof typeof SCRAPING_JOB_STATUS],
    error?: string,
  ): Promise<void> {
    await this.scrapingJobRepository.update(
      { applicationId, type },
      {
        status,
        finishedAt: new Date(),
        error: error ?? null,
      },
    );
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }
}
