import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { APPLICATION_STATUS, JOB_TYPES, SCRAPING_JOB_STATUS } from '../../common/constants';
import { ScraperError, isRetryableErrorCode } from '../../common/errors/scraper-error';
import { ReliableHttpClient } from '../../common/http/reliable-http.client';
import { AppLogger } from '../../common/logging/app-logger.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import {
  DistributedRateLimiter,
  RateLimitLease,
} from '../../common/rate-limit/distributed-rate-limiter.service';
import { AdsTxtFetchResult } from '../../common/types';
import { AppAdsTxtEntity, ApplicationEntity, ScrapingJobEntity } from '../../database/entities';
import { buildAdsTxtUrl, computeContentHash, hasContentChanged, normalizeDomain } from './domain.utils';

@Injectable()
export class AdsTxtFetcher {
  constructor(
    private readonly httpClient: ReliableHttpClient,
    private readonly rateLimiter: DistributedRateLimiter,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
    @InjectRepository(AppAdsTxtEntity)
    private readonly adsTxtRepository: Repository<AppAdsTxtEntity>,
    @InjectRepository(ScrapingJobEntity)
    private readonly scrapingJobRepository: Repository<ScrapingJobEntity>,
    private readonly logger: AppLogger,
    private readonly metrics: MetricsService,
  ) {}

  async fetch(applicationId: number, runId = `ads-${applicationId}`): Promise<AdsTxtFetchResult> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
    });

    if (!application) {
      throw new ScraperError('Permanent', 'Application not found');
    }

    if (!application.publisherDomain) {
      throw new ScraperError('InvalidDomain', 'Application has no publisher domain');
    }

    await this.markJobRunning(applicationId);
    let lease: RateLimitLease | null = null;
    let normalizedDomain = application.publisherDomain;
    const existing = await this.adsTxtRepository.findOne({
      where: { applicationId },
    });

    try {
      normalizedDomain = normalizeDomain(application.publisherDomain);
      const url = buildAdsTxtUrl(normalizedDomain);
      lease = await this.rateLimiter.acquire(normalizedDomain);
      const response = await this.fetchAdsTxtDocument(url);

      const contentType = response.headers.get('content-type');

      if (contentType && !contentType.includes('text')) {
        throw new ScraperError('InvalidContent', 'Unexpected content type', {
          contentType,
          responseStatus: response.status,
        });
      }

      const contentHash = computeContentHash(response.body);
      const changed = hasContentChanged(existing?.contentHash, response.body);
      const now = new Date();

      await this.adsTxtRepository.save(
        this.adsTxtRepository.create({
          id: existing?.id,
          applicationId,
          domain: normalizedDomain,
          content: response.body,
          contentHash,
          lastHttpStatus: response.status,
          lastFetchedAt: now,
          lastChangedAt: changed ? now : existing?.lastChangedAt ?? now,
          lastErrorCode: null,
        }),
      );

      application.lastAdsTxtCheckAt = now;
      application.nextAdsTxtCheckAt = this.addDays(now, 1);
      application.status = APPLICATION_STATUS.active;
      await this.applicationRepository.save(application);

      await this.markJobFinished(applicationId, SCRAPING_JOB_STATUS.succeeded);
      this.metrics.increment('ads_txt_fetch_total', { result: changed ? 'changed' : 'unchanged' });
      this.logger.log(
        {
          event: 'ads_txt_fetch_succeeded',
          runId,
          applicationId,
          bundleId: application.bundleId,
          domain: normalizedDomain,
          changed,
          httpStatus: response.status,
        },
        AdsTxtFetcher.name,
      );

      return {
        domain: normalizedDomain,
        url: response.finalUrl,
        content: response.body,
        contentHash,
        changed,
        httpStatus: response.status,
        errorCode: null,
        contentType,
        fetchedAt: now.toISOString(),
        lastChangedAt: (changed ? now : existing?.lastChangedAt ?? now).toISOString(),
      };
    } catch (error) {
      const classified = error instanceof ScraperError ? error : new ScraperError('Temporary', 'ads.txt fetch failed');
      const now = new Date();

      await this.adsTxtRepository.save(
        this.adsTxtRepository.create({
          id: existing?.id,
          applicationId,
          domain: normalizedDomain,
          content: existing?.content ?? null,
          contentHash: existing?.contentHash ?? null,
          lastHttpStatus: (classified.details?.responseStatus as number | null | undefined) ?? null,
          lastFetchedAt: now,
          lastChangedAt: existing?.lastChangedAt ?? null,
          lastErrorCode: classified.code,
        }),
      );

      application.lastAdsTxtCheckAt = now;
      application.nextAdsTxtCheckAt = this.addHours(now, isRetryableErrorCode(classified.code) ? 6 : 24);
      application.status =
        classified.code === 'InvalidDomain' ? APPLICATION_STATUS.invalidDomain : APPLICATION_STATUS.adsTxtFailed;
      await this.applicationRepository.save(application);

      await this.markJobFinished(
        applicationId,
        isRetryableErrorCode(classified.code) ? SCRAPING_JOB_STATUS.retrying : SCRAPING_JOB_STATUS.deadLetter,
        classified.message,
      );

      this.metrics.increment('ads_txt_fetch_errors_total', { code: classified.code });
      this.logger.error(
        {
          event: 'ads_txt_fetch_failed',
          runId,
          applicationId,
          bundleId: application.bundleId,
          code: classified.code,
          domain: normalizedDomain,
          httpStatus: classified.details?.responseStatus ?? null,
        },
        classified.stack,
        AdsTxtFetcher.name,
      );

      throw classified;
    } finally {
      if (lease) {
        await lease.release();
      }
    }
  }

  private async markJobRunning(applicationId: number): Promise<void> {
    await this.scrapingJobRepository.increment({ applicationId, type: JOB_TYPES.adsTxtFetch }, 'attempts', 1);
    await this.scrapingJobRepository.update(
      { applicationId, type: JOB_TYPES.adsTxtFetch },
      { status: SCRAPING_JOB_STATUS.running, startedAt: new Date(), finishedAt: null, error: null },
    );
  }

  private async markJobFinished(
    applicationId: number,
    status: typeof SCRAPING_JOB_STATUS[keyof typeof SCRAPING_JOB_STATUS],
    error?: string,
  ): Promise<void> {
    await this.scrapingJobRepository.update(
      { applicationId, type: JOB_TYPES.adsTxtFetch },
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

  private async fetchAdsTxtDocument(url: string): Promise<Awaited<ReturnType<ReliableHttpClient['get']>>> {
    return this.httpClient.get({
      url,
      headers: {
        Accept: 'text/plain, text/*;q=0.9, */*;q=0.1',
      },
    });
  }
}
