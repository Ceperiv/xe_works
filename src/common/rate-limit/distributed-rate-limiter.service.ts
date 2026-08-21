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

interface AcquiredSlot {
  key: string;
  token: string;
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
      const slots: AcquiredSlot[] = [];

      try {
        for (const key of keys) {
          const limit = key === 'global' ? this.config.rateLimit.globalLimit : this.config.rateLimit.perDomainLimit;
          const slot = await this.tryAcquireKey(key, limit);

          if (!slot) {
            throw new Error(`Unable to acquire key ${key}`);
          }

          slots.push(slot);
        }

        const heartbeat = this.startHeartbeat(slots);

        return {
          release: async () => {
            clearInterval(heartbeat);
            await Promise.all(slots.map((slot) => this.releaseSlot(slot)));
          },
        };
      } catch {
        await Promise.all(slots.map((slot) => this.releaseSlot(slot)));
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

  private async tryAcquireKey(key: string, limit: number): Promise<AcquiredSlot | null> {
    const token = `rate-limit:${key}:${randomUUID()}`;

    for (let attempt = 0; attempt < limit; attempt += 1) {
      const slotKey = `rate-limit-slot:${key}:${attempt}`;
      const acquired = await this.redis.set(slotKey, token, 'PX', this.config.rateLimit.slotTtlMs, 'NX');

      if (acquired === 'OK') {
        return {
          key: slotKey,
          token,
        };
      }
    }

    return null;
  }

  private startHeartbeat(slots: AcquiredSlot[]): NodeJS.Timeout {
    const intervalMs = Math.max(1000, Math.floor(this.config.rateLimit.slotTtlMs / 3));

    return setInterval(() => {
      void Promise.all(slots.map((slot) => this.renewSlot(slot)));
    }, intervalMs);
  }

  private async renewSlot(slot: AcquiredSlot): Promise<void> {
    await this.redis.eval(
      `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      end
      return 0
      `,
      1,
      slot.key,
      slot.token,
      `${this.config.rateLimit.slotTtlMs}`,
    );
  }

  private async releaseSlot(slot: AcquiredSlot): Promise<void> {
    await this.redis.eval(
      `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
      `,
      1,
      slot.key,
      slot.token,
    );
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
