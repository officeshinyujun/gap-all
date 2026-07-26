import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const GENERATION_RUN_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
] as const;

export type GenerationRunStatus = (typeof GENERATION_RUN_STATUSES)[number];

@Entity('generation_runs')
@Index(['idempotencyKey'], { unique: true })
export class GenerationRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'idempotency_key', type: 'varchar' })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: GenerationRunStatus;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'failure_reason', type: 'varchar', nullable: true })
  failureReason: string | null;

  @Column({ name: 'trusted_metadata', type: 'jsonb' })
  trustedMetadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
