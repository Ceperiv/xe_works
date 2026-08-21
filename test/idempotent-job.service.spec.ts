import { JOB_TYPES } from '../src/common/constants';
import { IdempotentJobService } from '../src/modules/queue/idempotent-job.service';

describe('IdempotentJobService', () => {
  it('uses deterministic job ids for duplicate enqueue requests', async () => {
    const marketplaceQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const adsTxtQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const scrapingJobRepository = { upsert: jest.fn().mockResolvedValue(undefined) };
    const applicationRepository = { findOne: jest.fn().mockResolvedValue({ id: 42 }) };

    const service = new IdempotentJobService(
      {
        queue: {
          attempts: 5,
          backoffMs: 1000,
        },
      } as never,
      marketplaceQueue as never,
      adsTxtQueue as never,
      scrapingJobRepository as never,
      applicationRepository as never,
      { log: jest.fn() } as never,
    );

    await service.enqueue(42, JOB_TYPES.adsTxtFetch, 'api');
    await service.enqueue(42, JOB_TYPES.adsTxtFetch, 'api');

    expect(adsTxtQueue.add).toHaveBeenCalledTimes(2);
    expect(adsTxtQueue.add).toHaveBeenNthCalledWith(
      1,
      JOB_TYPES.adsTxtFetch,
      expect.objectContaining({ applicationId: 42 }),
      expect.objectContaining({ jobId: 'ads_txt_fetch:42' }),
    );
    expect(adsTxtQueue.add).toHaveBeenNthCalledWith(
      2,
      JOB_TYPES.adsTxtFetch,
      expect.objectContaining({ applicationId: 42 }),
      expect.objectContaining({ jobId: 'ads_txt_fetch:42' }),
    );
  });
});
