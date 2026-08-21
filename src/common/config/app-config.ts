import { registerAs } from '@nestjs/config';

export type AppRole = 'api' | 'worker' | 'scheduler';

export interface AppConfig {
  app: {
    role: AppRole;
    port: number;
    nodeEnv: string;
  };
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
  queue: {
    attempts: number;
    backoffMs: number;
    marketplaceConcurrency: number;
    adsTxtConcurrency: number;
  };
  http: {
    timeoutMs: number;
    maxResponseSize: number;
    retryLimit: number;
    retryBaseDelayMs: number;
    redirectLimit: number;
  };
  rateLimit: {
    globalLimit: number;
    perDomainLimit: number;
    slotTtlMs: number;
    acquireTimeoutMs: number;
    pollMs: number;
  };
  scheduler: {
    pollIntervalMs: number;
    batchSize: number;
    lockTtlMs: number;
  };
}

const parseNumber = (value: string | undefined, fallback: number, name: string): number => {
  const resolved = value ?? `${fallback}`;
  const parsed = Number.parseInt(resolved, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric config for ${name}: ${resolved}`);
  }

  return parsed;
};

const parseRole = (value: string | undefined): AppRole => {
  if (value === 'worker' || value === 'scheduler' || value === 'api') {
    return value;
  }

  return 'api';
};

const buildAppConfig = (): AppConfig => {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  if (!redisUrl) {
    throw new Error('REDIS_URL is required');
  }

  return {
    app: {
      role: parseRole(process.env.APP_ROLE),
      port: parseNumber(process.env.PORT, 3000, 'PORT'),
      nodeEnv: process.env.NODE_ENV ?? 'development',
    },
    database: {
      url: databaseUrl,
    },
    redis: {
      url: redisUrl,
    },
    queue: {
      attempts: parseNumber(process.env.QUEUE_ATTEMPTS, 5, 'QUEUE_ATTEMPTS'),
      backoffMs: parseNumber(process.env.QUEUE_BACKOFF_MS, 1000, 'QUEUE_BACKOFF_MS'),
      marketplaceConcurrency: parseNumber(
        process.env.MARKETPLACE_CONCURRENCY,
        10,
        'MARKETPLACE_CONCURRENCY',
      ),
      adsTxtConcurrency: parseNumber(
        process.env.ADS_TXT_CONCURRENCY,
        25,
        'ADS_TXT_CONCURRENCY',
      ),
    },
    http: {
      timeoutMs: parseNumber(process.env.HTTP_TIMEOUT_MS, 5000, 'HTTP_TIMEOUT_MS'),
      maxResponseSize: parseNumber(
        process.env.HTTP_MAX_RESPONSE_SIZE,
        262144,
        'HTTP_MAX_RESPONSE_SIZE',
      ),
      retryLimit: parseNumber(process.env.HTTP_RETRY_LIMIT, 3, 'HTTP_RETRY_LIMIT'),
      retryBaseDelayMs: parseNumber(
        process.env.HTTP_RETRY_BASE_DELAY_MS,
        250,
        'HTTP_RETRY_BASE_DELAY_MS',
      ),
      redirectLimit: parseNumber(process.env.HTTP_REDIRECT_LIMIT, 5, 'HTTP_REDIRECT_LIMIT'),
    },
    rateLimit: {
      globalLimit: parseNumber(process.env.GLOBAL_RATE_LIMIT, 50, 'GLOBAL_RATE_LIMIT'),
      perDomainLimit: parseNumber(
        process.env.PER_DOMAIN_RATE_LIMIT,
        2,
        'PER_DOMAIN_RATE_LIMIT',
      ),
      slotTtlMs: parseNumber(
        process.env.RATE_LIMIT_SLOT_TTL_MS,
        15000,
        'RATE_LIMIT_SLOT_TTL_MS',
      ),
      acquireTimeoutMs: parseNumber(
        process.env.RATE_LIMIT_ACQUIRE_TIMEOUT_MS,
        5000,
        'RATE_LIMIT_ACQUIRE_TIMEOUT_MS',
      ),
      pollMs: parseNumber(process.env.RATE_LIMIT_POLL_MS, 100, 'RATE_LIMIT_POLL_MS'),
    },
    scheduler: {
      pollIntervalMs: parseNumber(
        process.env.SCHEDULER_POLL_INTERVAL_MS,
        10000,
        'SCHEDULER_POLL_INTERVAL_MS',
      ),
      batchSize: parseNumber(process.env.SCHEDULER_BATCH_SIZE, 200, 'SCHEDULER_BATCH_SIZE'),
      lockTtlMs: parseNumber(
        process.env.SCHEDULER_LOCK_TTL_MS,
        30000,
        'SCHEDULER_LOCK_TTL_MS',
      ),
    },
  };
};

export const appConfig = registerAs('app', buildAppConfig);
export { buildAppConfig as loadAppConfig };
