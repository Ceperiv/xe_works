import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { appConfig } from '../config/app-config';
import { ScraperError } from '../errors/scraper-error';
import { AppLogger } from '../logging/app-logger.service';
import { REDIS_CLIENT } from './redis.constants';

export interface RateLimitLease {
  release(): Promise<void>;
}

@Injectable()
export class DistributedRateLimiter {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly logger: AppLogger,
  ) {}

  async acquire(domain?: string): Promise<RateLimitLease> {
    const startedAt = Date.now();
    const keys = ['global'];

    if (domain) {
      keys.push(`domain:${domain}`);
    }

    while (Date.now() - startedAt < this.config.rateLimit.acquireTimeoutMs) {
      const tokens: string[] = [];

      try {
        for (const key of keys) {
          const limit = key === 'global' ? this.config.rateLimit.globalLimit : this.config.rateLimit.perDomainLimit;
          const token = await this.tryAcquireKey(key, limit);

          if (!token) {
            throw new Error(`Unable to acquire key ${key}`);
          }

          tokens.push(token);
        }

        return {
          release: async () => {
            await Promise.all(tokens.map((token) => this.redis.del(token)));
          },
        };
      } catch {
        await Promise.all(tokens.map((token) => this.redis.del(token)));
        await this.delay(this.config.rateLimit.pollMs);
      }
    }

    this.logger.warn(
      {
        event: 'rate_limit_timeout',
        domain: domain ?? null,
      },
      DistributedRateLimiter.name,
    );

    throw new ScraperError('RateLimited', 'Could not acquire distributed rate limit slot', {
      domain: domain ?? null,
    });
  }

  private async tryAcquireKey(key: string, limit: number): Promise<string | null> {
    const token = `rate-limit:${key}:${randomUUID()}`;

    for (let attempt = 0; attempt < limit; attempt += 1) {
      const slotKey = `rate-limit-slot:${key}:${attempt}`;
      const acquired = await this.redis.set(slotKey, token, 'PX', this.config.rateLimit.slotTtlMs, 'NX');

      if (acquired === 'OK') {
        return slotKey;
      }
    }

    return null;
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
