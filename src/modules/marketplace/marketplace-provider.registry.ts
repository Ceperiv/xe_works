import { Injectable } from '@nestjs/common';
import { MARKETPLACE, Marketplace } from '../../common/constants';
import { MarketplaceProvider } from '../../common/types';
import { AppStoreProvider } from './providers/app-store.provider';
import { GooglePlayProvider } from './providers/google-play.provider';

@Injectable()
export class MarketplaceProviderRegistry {
  constructor(
    private readonly appStoreProvider: AppStoreProvider,
    private readonly googlePlayProvider: GooglePlayProvider,
  ) {}

  getProvider(marketplace: Marketplace): MarketplaceProvider {
    if (marketplace === MARKETPLACE.appStore) {
      return this.appStoreProvider;
    }

    return this.googlePlayProvider;
  }
}
