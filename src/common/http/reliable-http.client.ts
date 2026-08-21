import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { appConfig } from '../config/app-config';
import { ScraperError } from '../errors/scraper-error';
import { AppLogger } from '../logging/app-logger.service';
import { MetricsService } from '../metrics/metrics.service';
import { classifyHttpFailure, shouldRetryHttpError } from './http-error-classifier';
import { parseRetryAfterHeader, validateOutboundUrl } from './url-safety';

export interface HttpRequestOptions {
  url: string;
  method?: 'GET';
  headers?: Record<string, string>;
}

export interface HttpResponsePayload {
  status: number;
  headers: Headers;
  body: string;
  finalUrl: string;
  redirectCount: number;
}

@Injectable()
export class ReliableHttpClient {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    private readonly logger: AppLogger,
    private readonly metrics: MetricsService,
  ) {}

  async get(options: HttpRequestOptions): Promise<HttpResponsePayload> {
    const { http } = this.config;

    for (let attempt = 1; attempt <= http.retryLimit; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), http.timeoutMs);

      try {
        return await this.executeRequest(options, controller.signal);
      } catch (error) {
        const classified = classifyHttpFailure(
          error,
          this.extractResponseStatus(error),
          this.extractResponseHeaders(error),
        );
        const retryable = shouldRetryHttpError(
          classified.code,
          this.extractResponseStatus(error) ?? (classified.details?.responseStatus as number | undefined),
        );

        this.logger.warn(
          {
            event: 'http_request_failed',
            url: options.url,
            attempt,
            code: classified.code,
            message: classified.message,
            status: classified.details?.responseStatus ?? null,
          },
          ReliableHttpClient.name,
        );

        this.metrics.increment('http_failures_total', {
          code: classified.code,
        });

        if (!retryable || attempt >= http.retryLimit) {
          throw classified;
        }

        const retryAfterMs =
          this.extractRetryAfterMs(error) ??
          this.computeBackoffWithJitter(http.retryBaseDelayMs, attempt);

        await this.delay(retryAfterMs);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error('Unreachable retry loop');
  }

  private async executeRequest(
    options: HttpRequestOptions,
    signal: AbortSignal,
  ): Promise<HttpResponsePayload> {
    const { http } = this.config;
    let currentUrl = await validateOutboundUrl(options.url);
    let redirectCount = 0;

    while (true) {
      const response = await fetch(currentUrl.toString(), {
        method: options.method ?? 'GET',
        headers: options.headers,
        redirect: 'manual',
        signal,
      });

      if (this.isRedirectResponse(response.status)) {
        const location = response.headers.get('location');

        await this.cancelResponseBody(response);

        if (!location) {
          throw new ScraperError('InvalidUrl', 'Redirect response has no Location header', {
            responseStatus: response.status,
            url: currentUrl.toString(),
          });
        }

        if (redirectCount >= http.redirectLimit) {
          throw new ScraperError('Temporary', 'Redirect limit exceeded', {
            responseStatus: response.status,
            url: currentUrl.toString(),
            redirectCount,
          });
        }

        currentUrl = await validateOutboundUrl(new URL(location, currentUrl).toString());
        redirectCount += 1;
        continue;
      }

      this.metrics.increment('http_requests_total', {
        status: `${response.status}`,
      });

      if (response.status >= 400) {
        await this.cancelResponseBody(response);
        const error = classifyHttpFailure(undefined, response.status, response.headers);
        throw new ScraperError(error.code, error.message, {
          ...error.details,
          responseStatus: response.status,
          responseHeaders: response.headers,
          finalUrl: currentUrl.toString(),
          redirectCount,
        });
      }

      const body = await this.readBoundedBody(response, http.maxResponseSize);

      return {
        status: response.status,
        headers: response.headers,
        body,
        finalUrl: currentUrl.toString(),
        redirectCount,
      };
    }
  }

  private async readBoundedBody(response: Response, maxSize: number): Promise<string> {
    if (!response.body) {
      return '';
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      total += value.byteLength;

      if (total > maxSize) {
        await reader.cancel();
        throw new ScraperError('ResponseTooLarge', 'Response body exceeded maximum size', {
          responseStatus: response.status,
          maxSize,
        });
      }

      chunks.push(value);
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
  }

  private isRedirectResponse(status: number): boolean {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
  }

  private extractRetryAfterMs(error: unknown): number | null {
    const headers = this.extractResponseHeaders(error);
    return headers ? parseRetryAfterHeader(headers) : null;
  }

  private extractResponseHeaders(error: unknown): Headers | undefined {
    return (error as ScraperError | undefined)?.details?.responseHeaders as Headers | undefined;
  }

  private extractResponseStatus(error: unknown): number | undefined {
    return (error as ScraperError | undefined)?.details?.responseStatus as number | undefined;
  }

  private computeBackoffWithJitter(baseDelayMs: number, attempt: number): number {
    const exponential = Math.min(30_000, baseDelayMs * 2 ** (attempt - 1));
    const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exponential / 4)));
    return exponential + jitter;
  }

  private async cancelResponseBody(response: Response): Promise<void> {
    if (!response.body) {
      return;
    }

    try {
      await response.body.cancel();
    } catch {
      return;
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
