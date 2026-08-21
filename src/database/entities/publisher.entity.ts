import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ApplicationEntity } from './application.entity';

@Entity({ name: 'publishers' })
@Unique('uq_publishers_domain', ['domain'])
export class PublisherEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  @Index('idx_publishers_name')
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  domain!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => ApplicationEntity, (application) => application.publisher)
  applications!: ApplicationEntity[];
}
