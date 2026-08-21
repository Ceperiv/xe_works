import { SchedulerService } from '../src/modules/scheduler/scheduler.service';

describe('SchedulerService batching', () => {
  it('schedules due marketplace checks in batches', async () => {
    const batches = [
      [{ id: 1 }, { id: 2 }],
      [{ id: 3 }],
    ];

    const queryBuilderFactory = () => {
      const batch = batches.shift() ?? [];
      return {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(batch),
      };
    };

    const service = new SchedulerService(
      {
        app: { role: 'scheduler' },
        scheduler: {
          pollIntervalMs: 1000,
          batchSize: 2,
          lockTtlMs: 1000,
        },
      } as never,
      { set: jest.fn(), del: jest.fn() } as never,
      { createQueryBuilder: jest.fn(queryBuilderFactory) } as never,
      { enqueue: jest.fn().mockResolvedValue(true) } as never,
      { log: jest.fn() } as never,
    );

    const queued = await service.scheduleDueMarketplaceChecks();

    expect(queued).toBe(3);
    expect((service as any).enqueueService.enqueue).toHaveBeenCalledTimes(3);
  });
});
