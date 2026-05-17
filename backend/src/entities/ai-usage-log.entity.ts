import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum AiUsageSource {
  CHAT = 'chat',
  EXAM_STEP1 = 'exam_step1',
  EXAM_STEP2 = 'exam_step2',
  STUDY_BLANK = 'study_blank',
  STUDY_CONCEPT = 'study_concept',
  EXAM_VALIDATION = 'exam_validation',
}

@Entity('ai_usage_logs')
export class AiUsageLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  source: AiUsageSource;

  @Column({ type: 'varchar', length: 100 })
  model: string;

  @Column({ name: 'prompt_tokens', type: 'int', default: 0 })
  promptTokens: number;

  @Column({ name: 'completion_tokens', type: 'int', default: 0 })
  completionTokens: number;

  @Column({ name: 'total_tokens', type: 'int', default: 0 })
  totalTokens: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
