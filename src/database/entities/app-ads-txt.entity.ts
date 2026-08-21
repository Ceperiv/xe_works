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
import { ApplicationEntity } from './application.entity';

@Entity({ name: 'app_ads_txt' })
@Unique('uq_app_ads_txt_application', ['applicationId'])
@Index('idx_app_ads_txt_fetched_at', ['fetchedAt'])
@Index('idx_app_ads_txt_last_changed_at', ['lastChangedAt'])
export class AppAdsTxtEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  applicationId!: number;

  @ManyToOne(() => ApplicationEntity, (application) => application.adsTxtRecords, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'applicationId' })
  application!: ApplicationEntity;

  @Column({ type: 'varchar', length: 255 })
  domain!: string;

  @Column({ type: 'text', nullable: true })
  content!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  contentHash!: string | null;

  @Column({ type: 'int', nullable: true })
  httpStatus!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  fetchedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastChangedAt!: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
