import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ApplicationStatus, Marketplace } from '../../common/constants';
import { AppAdsTxtEntity } from './app-ads-txt.entity';
import { PublisherEntity } from './publisher.entity';
import { ScrapingJobEntity } from './scraping-job.entity';

@Entity({ name: 'applications' })
@Unique('uq_applications_bundle_marketplace', ['bundleId', 'marketplace'])
@Index('idx_applications_next_marketplace_check', ['nextMarketplaceCheckAt', 'id'])
@Index('idx_applications_next_ads_txt_check', ['nextAdsTxtCheckAt', 'id'])
@Index('idx_applications_status', ['status'])
export class ApplicationEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  bundleId!: string;

  @Column({ type: 'varchar', length: 32 })
  marketplace!: Marketplace;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ type: 'int', nullable: true })
  publisherId!: number | null;

  @ManyToOne(() => PublisherEntity, (publisher) => publisher.applications, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'publisherId' })
  publisher!: PublisherEntity | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  publisherDomain!: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  marketplaceUrl!: string | null;

  @Column({ type: 'varchar', length: 64, default: 'pending' })
  status!: ApplicationStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastMarketplaceCheckAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextMarketplaceCheckAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastAdsTxtCheckAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextAdsTxtCheckAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => AppAdsTxtEntity, (adsTxt) => adsTxt.application)
  adsTxtRecords!: AppAdsTxtEntity[];

  @OneToMany(() => ScrapingJobEntity, (job) => job.application)
  scrapingJobs!: ScrapingJobEntity[];
}
