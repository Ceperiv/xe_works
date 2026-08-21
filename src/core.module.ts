import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigType, ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { appConfig } from './common/config/app-config';
import { QUEUE_NAMES } from './common/constants';
import { ReliableHttpClient } from './common/http/reliable-http.client';
import { AppLogger } from './common/logging/app-logger.service';
import { MetricsService } from './common/metrics/metrics.service';
import { DistributedRateLimiter } from './common/rate-limit/distributed-rate-limiter.service';
import { REDIS_CLIENT } from './common/rate-limit/redis.constants';
import {
  AppAdsTxtEntity,
  ApplicationEntity,
  PublisherEntity,
  ScrapingJobEntity,
} from './database/entities';
import { ApplicationsService } from './modules/applications/applications.service';
import { AdsTxtFetcher } from './modules/ads-txt/ads-txt.fetcher';
import { MarketplaceProviderRegistry } from './modules/marketplace/marketplace-provider.registry';
import { MarketplaceService } from './modules/marketplace/marketplace.service';
import { AppStoreProvider } from './modules/marketplace/providers/app-store.provider';
import { GooglePlayProvider } from './modules/marketplace/providers/google-play.provider';
import { IdempotentJobService } from './modules/queue/idempotent-job.service';
import { SeedService } from './modules/seed/seed.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: ConfigType<typeof appConfig>) => ({
        type: 'postgres',
        url: config.database.url,
        synchronize: true,
        entities: [ApplicationEntity, PublisherEntity, AppAdsTxtEntity, ScrapingJobEntity],
      }),
    }),
    TypeOrmModule.forFeature([ApplicationEntity, PublisherEntity, AppAdsTxtEntity, ScrapingJobEntity]),
    BullModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: ConfigType<typeof appConfig>) => ({
        connection: {
          url: config.redis.url,
        },
      }),
    }),
    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.marketplaceDiscovery,
      },
      {
        name: QUEUE_NAMES.adsTxtFetch,
      },
    ),
  ],
  providers: [
    AppLogger,
    MetricsService,
    ReliableHttpClient,
    DistributedRateLimiter,
    ApplicationsService,
    AdsTxtFetcher,
    MarketplaceProviderRegistry,
    MarketplaceService,
    AppStoreProvider,
    GooglePlayProvider,
    IdempotentJobService,
    SeedService,
    {
      provide: REDIS_CLIENT,
      inject: [appConfig.KEY],
      useFactory: (config: ConfigType<typeof appConfig>) => new Redis(config.redis.url),
    },
  ],
  exports: [
    ApplicationsService,
    AdsTxtFetcher,
    AppLogger,
    DistributedRateLimiter,
    IdempotentJobService,
    MarketplaceService,
    MetricsService,
    SeedService,
    TypeOrmModule,
    BullModule,
    REDIS_CLIENT,
  ],
})
export class CoreModule {}
