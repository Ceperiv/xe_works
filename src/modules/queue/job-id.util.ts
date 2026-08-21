import { JobType } from '../../common/constants';

export const buildScrapingJobId = (applicationId: number, type: JobType): string =>
  `${type}:${applicationId}`;
