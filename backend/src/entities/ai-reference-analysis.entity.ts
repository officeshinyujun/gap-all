import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('ai_reference_analyses')
@Index(['sourceId', 'analysisVersion'], { unique: true })
export class AiReferenceAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_id', type: 'varchar' })
  sourceId: string;

  @Column({ name: 'source_hash', type: 'varchar' })
  sourceHash: string;

  @Column({ name: 'analysis_version', type: 'varchar', length: 32 })
  analysisVersion: string;

  @Column({ name: 'provider_model', type: 'varchar', nullable: true })
  providerModel: string | null;

  @Column({ name: 'prompt_hash', type: 'varchar', nullable: true })
  promptHash: string | null;

  @Column({ type: 'jsonb' })
  analysis: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
