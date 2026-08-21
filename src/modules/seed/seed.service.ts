import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { APPLICATION_STATUS, MARKETPLACE } from '../../common/constants';
import { ApplicationEntity } from '../../database/entities';

const seedApplications = Array.from({ length: 10 }, (_, index) => ({
  bundleId: `com.demo.app${index + 1}`,
  marketplace: MARKETPLACE.googlePlay,
})).concat(
  Array.from({ length: 10 }, (_, index) => ({
    bundleId: `com.demo.ios${index + 1}`,
    marketplace: MARKETPLACE.appStore,
  })),
);

@Injectable()
export class SeedService {
  constructor(
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
  ) {}

  async seed(): Promise<void> {
    const count = await this.applicationRepository.count();

    if (count > 0) {
      return;
    }

    const now = new Date();
    const entities = seedApplications.map((application) =>
      this.applicationRepository.create({
        ...application,
        name: null,
        publisherId: null,
        publisherDomain: null,
        marketplaceUrl: null,
        status: APPLICATION_STATUS.pending,
        lastMarketplaceCheckAt: null,
        nextMarketplaceCheckAt: now,
        lastAdsTxtCheckAt: null,
        nextAdsTxtCheckAt: null,
      }),
    );

    await this.applicationRepository.save(entities);
  }
}
