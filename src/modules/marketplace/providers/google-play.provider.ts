import { Injectable } from '@nestjs/common';
import { MARKETPLACE } from '../../../common/constants';
import { ScraperError } from '../../../common/errors/scraper-error';
import { MarketplaceApplication, MarketplaceProvider } from '../../../common/types';
import { MOCK_MARKETPLACE_DATA } from './mock-marketplace.data';

@Injectable()
export class GooglePlayProvider implements MarketplaceProvider {
  async findApplication(bundleId: string): Promise<MarketplaceApplication | null> {
    if (bundleId.includes('network')) {
      throw new ScraperError('NetworkError', 'Mock Google Play network issue');
    }

    if (bundleId.includes('removed')) {
      return {
        bundleId,
        marketplace: MARKETPLACE.googlePlay,
        name: bundleId,
        publisherName: 'Removed Publisher',
        publisherDomain: null,
        marketplaceUrl: `https://play.google.com/store/apps/details?id=${bundleId}`,
        removed: true,
      };
    }

    const application = MOCK_MARKETPLACE_DATA[bundleId];

    if (!application || application.marketplace !== MARKETPLACE.googlePlay) {
      return null;
    }

    return application;
  }
}
