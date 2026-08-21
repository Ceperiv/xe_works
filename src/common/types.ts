import { Marketplace } from './constants';

export interface MarketplaceApplication {
  bundleId: string;
  marketplace: Marketplace;
  name: string;
  publisherName: string;
  publisherDomain: string | null;
  marketplaceUrl: string;
  removed?: boolean;
}

export interface MarketplaceProvider {
  findApplication(bundleId: string): Promise<MarketplaceApplication | null>;
}

export interface AdsTxtFetchResult {
  domain: string;
  url: string;
  content: string | null;
  contentHash: string | null;
  changed: boolean;
  httpStatus: number | null;
  errorCode: string | null;
  contentType: string | null;
}
