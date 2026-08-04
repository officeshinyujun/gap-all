import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('generation_jobs')
@Index(['userId', 'status'])
export class GenerationJob {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'user_id', type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

  @Column({ type: 'jsonb' })
  request: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  state: Record<string, unknown>;

  @Column({ name: 'heartbeat_at', type: 'timestamp' })
  heartbeatAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
