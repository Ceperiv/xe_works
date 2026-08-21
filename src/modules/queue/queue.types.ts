import { JobType } from '../../common/constants';

export interface ScrapingQueuePayload {
  applicationId: number;
  type: JobType;
  triggeredBy: 'scheduler' | 'api' | 'worker';
  scheduledAt: string;
}
