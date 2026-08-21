import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { AdsTxtProcessor } from './modules/queue/ads-txt.processor';
import { MarketplaceProcessor } from './modules/queue/marketplace.processor';

@Module({
  imports: [CoreModule],
  providers: [MarketplaceProcessor, AdsTxtProcessor],
})
export class WorkerModule {}
