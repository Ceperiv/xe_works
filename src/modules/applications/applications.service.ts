import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JOB_TYPES } from '../../common/constants';
import { ApplicationEntity } from '../../database/entities';
import { IdempotentJobService } from '../queue/idempotent-job.service';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
    private readonly enqueueService: IdempotentJobService,
  ) {}

  async getById(id: number): Promise<ApplicationEntity> {
    const application = await this.applicationRepository.findOne({
      where: { id },
      relations: ['publisher', 'adsTxtRecords', 'scrapingJobs'],
    });

    if (!application) {
      throw new NotFoundException(`Application ${id} not found`);
    }

    return application;
  }

  async enqueueAdsTxtScrape(id: number): Promise<{ enqueued: boolean }> {
    await this.getById(id);
    const enqueued = await this.enqueueService.enqueue(id, JOB_TYPES.adsTxtFetch, 'api');
    return { enqueued };
  }

  async enqueueMarketplaceRefresh(id: number): Promise<{ enqueued: boolean }> {
    await this.getById(id);
    const enqueued = await this.enqueueService.enqueue(id, JOB_TYPES.marketplaceDiscovery, 'api');
    return { enqueued };
  }
}
