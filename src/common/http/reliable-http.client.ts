import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { appConfig } from '../config/app-config';
import { AppLogger } from '../logging/app-logger.service';
import { MetricsService } from '../metrics/metrics.service';
import { classifyHttpFailure, shouldRetryHttpError } from './http-error-classifier';

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
        const response = await fetch(options.url, {
          method: options.method ?? 'GET',
          headers: options.headers,
          redirect: 'follow',
          signal: controller.signal,
        });

        if (response.url && this.countRedirects(options.url, response.url) > http.redirectLimit) {
          throw classifyHttpFailure(new Error('Redirect limit exceeded'));
        }

        const body = await this.readBoundedBody(response, http.maxResponseSize);

        this.metrics.increment('http_requests_total', {
          status: `${response.status}`,
        });

        if (response.status >= 400) {
          throw classifyHttpFailure(undefined, response.status);
        }

        return {
          status: response.status,
          headers: response.headers,
          body,
          finalUrl: response.url || options.url,
        };
      } catch (error) {
        const classified = classifyHttpFailure(error);
        const retryable = shouldRetryHttpError(classified.code);

        this.logger.warn(
          {
            event: 'http_request_failed',
            url: options.url,
            attempt,
            code: classified.code,
            message: classified.message,
          },
          ReliableHttpClient.name,
        );

        this.metrics.increment('http_failures_total', {
          code: classified.code,
        });

        if (!retryable || attempt >= http.retryLimit) {
          throw classified;
        }

        await this.delay(http.retryBaseDelayMs * 2 ** (attempt - 1));
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error('Unreachable retry loop');
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
        throw classifyHttpFailure(new Error('Response body exceeded maximum size'));
      }

      chunks.push(value);
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
  }

  private countRedirects(requestUrl: string, finalUrl: string): number {
    return requestUrl === finalUrl ? 0 : 1;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
