import { JOB_TYPES } from '../src/common/constants';
import { IdempotentJobService } from '../src/modules/queue/idempotent-job.service';

describe('IdempotentJobService', () => {
  it('uses deterministic job ids and skips duplicate scheduled enqueue requests', async () => {
    const marketplaceQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const adsTxtQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJob: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ getState: jest.fn().mockResolvedValue('waiting') }),
    };
    const scrapingJobRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ status: 'scheduled', startedAt: null }),
      insert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    };
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

    const first = await service.enqueueIfNeeded(42, JOB_TYPES.adsTxtFetch, 'api');
    const second = await service.enqueueIfNeeded(42, JOB_TYPES.adsTxtFetch, 'api');

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(adsTxtQueue.add).toHaveBeenCalledTimes(1);
    expect(adsTxtQueue.add).toHaveBeenNthCalledWith(
      1,
      JOB_TYPES.adsTxtFetch,
      expect.objectContaining({ applicationId: 42 }),
      expect.objectContaining({ jobId: 'ads_txt_fetch:42' }),
    );
  });
});
