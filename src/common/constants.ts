export const QUEUE_NAMES = {
  marketplaceDiscovery: 'marketplace-discovery',
  adsTxtFetch: 'ads-txt-fetch',
} as const;

export const JOB_TYPES = {
  marketplaceDiscovery: 'marketplace_discovery',
  adsTxtFetch: 'ads_txt_fetch',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

export const APPLICATION_STATUS = {
  pending: 'pending',
  active: 'active',
  notFound: 'not_found',
  removed: 'removed',
  invalidDomain: 'invalid_domain',
  marketplaceFailed: 'marketplace_failed',
  adsTxtFailed: 'ads_txt_failed',
} as const;

export type ApplicationStatus = (typeof APPLICATION_STATUS)[keyof typeof APPLICATION_STATUS];

export const SCRAPING_JOB_STATUS = {
  scheduled: 'scheduled',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  deadLetter: 'dead_letter',
} as const;

export type ScrapingJobStatus =
  (typeof SCRAPING_JOB_STATUS)[keyof typeof SCRAPING_JOB_STATUS];

export const MARKETPLACE = {
  appStore: 'app_store',
  googlePlay: 'google_play',
} as const;

export type Marketplace = (typeof MARKETPLACE)[keyof typeof MARKETPLACE];
