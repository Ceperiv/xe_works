import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { JobType, ScrapingJobStatus } from '../../common/constants';
import { ApplicationEntity } from './application.entity';

@Entity({ name: 'scraping_jobs' })
@Unique('uq_scraping_jobs_application_type', ['applicationId', 'type'])
@Index('idx_scraping_jobs_status', ['status'])
@Index('idx_scraping_jobs_scheduled_at', ['scheduledAt'])
export class ScrapingJobEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  applicationId!: number;

  @ManyToOne(() => ApplicationEntity, (application) => application.scrapingJobs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'applicationId' })
  application!: ApplicationEntity;

  @Column({ type: 'varchar', length: 64 })
  type!: JobType;

  @Column({ type: 'varchar', length: 32 })
  status!: ScrapingJobStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
