import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('ai_generation_candidates')
@Index(['runId', 'blueprintId', 'attempt'], { unique: true })
export class AiGenerationCandidate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'run_id', type: 'uuid' })
  runId: string;

  @Column({ name: 'blueprint_id', type: 'varchar' })
  blueprintId: string;

  @Column({ type: 'varchar', nullable: true })
  template: string | null;

  @Column({ type: 'int' })
  attempt: number;

  @Column({ type: 'varchar', length: 20 })
  status: 'accepted' | 'rejected';

  @Column({ name: 'failure_code', type: 'varchar', nullable: true })
  failureCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  fingerprint: string | null;

  @Column({ type: 'jsonb', nullable: true })
  candidate: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  validation: Record<string, unknown> | null;

  @Column({ name: 'provider_model', type: 'varchar', nullable: true })
  providerModel: string | null;

  @Column({ name: 'prompt_hash', type: 'varchar', nullable: true })
  promptHash: string | null;

  @Column({ name: 'latency_ms', type: 'int', nullable: true })
  latencyMs: number | null;

  @Column({ name: 'provider_usage', type: 'jsonb', nullable: true })
  providerUsage: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
