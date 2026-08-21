import { Injectable } from '@nestjs/common';
import { MARKETPLACE } from '../../../common/constants';
import { ScraperError } from '../../../common/errors/scraper-error';
import { MarketplaceApplication, MarketplaceProvider } from '../../../common/types';
import { MOCK_MARKETPLACE_DATA } from './mock-marketplace.data';

@Injectable()
export class AppStoreProvider implements MarketplaceProvider {
  async findApplication(bundleId: string): Promise<MarketplaceApplication | null> {
    if (bundleId.includes('timeout')) {
      throw new ScraperError('Timeout', 'Mock App Store timeout');
    }

    if (bundleId.includes('rate-limit')) {
      throw new ScraperError('RateLimited', 'Mock App Store rate limit');
    }

    const application = MOCK_MARKETPLACE_DATA[bundleId];

    if (!application || application.marketplace !== MARKETPLACE.appStore) {
      return null;
    }

    return application;
  }
}
