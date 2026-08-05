import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const AI_GENERATION_RUN_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
] as const;

export type AiGenerationRunStatus = (typeof AI_GENERATION_RUN_STATUSES)[number];

@Entity('ai_generation_runs')
@Index(['idempotencyKey'], { unique: true })
export class AiGenerationRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128 })
  idempotencyKey: string;

  @Column({ name: 'user_id', type: 'varchar' })
  userId: string;

  @Column({ name: 'subject_id', type: 'varchar' })
  subjectId: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: AiGenerationRunStatus;

  @Column({ type: 'jsonb' })
  request: Record<string, unknown>;

  @Column({ name: 'profile_version', type: 'varchar', length: 32 })
  profileVersion: string;

  @Column({ name: 'blueprint_version', type: 'varchar', length: 32 })
  blueprintVersion: string;

  @Column({ name: 'prompt_version', type: 'varchar', length: 32 })
  promptVersion: string;

  @Column({ name: 'validator_version', type: 'varchar', length: 32 })
  validatorVersion: string;

  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ type: 'varchar', length: 32, default: 'queued' })
  stage: string;

  @Column({ name: 'accepted_count', type: 'int', default: 0 })
  acceptedCount: number;

  @Column({ name: 'rejected_count', type: 'int', default: 0 })
  rejectedCount: number;

  @Column({ name: 'provider_latency_ms', type: 'int', default: 0 })
  providerLatencyMs: number;

  @Column({ name: 'prompt_tokens', type: 'int', default: 0 })
  promptTokens: number;

  @Column({ name: 'completion_tokens', type: 'int', default: 0 })
  completionTokens: number;

  @Column({ name: 'total_tokens', type: 'int', default: 0 })
  totalTokens: number;

  @Column({ name: 'failure_code', type: 'varchar', nullable: true })
  failureCode: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ name: 'rejections_by_template', type: 'jsonb', nullable: true })
  rejectionsByTemplate: Record<string, number> | null;

  @Column({ name: 'rejections_by_code', type: 'jsonb', nullable: true })
  rejectionsByCode: Record<string, number> | null;

  @Column({ name: 'exam_id', type: 'uuid', nullable: true })
  examId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
