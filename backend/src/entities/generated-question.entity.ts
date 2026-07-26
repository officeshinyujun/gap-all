import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('generated_questions')
@Index(['generationRunId', 'slotId'], { unique: true })
export class GeneratedQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'generation_run_id', type: 'uuid' })
  generationRunId: string;

  @Column({ name: 'slot_id', type: 'varchar' })
  slotId: string;

  @Column({ name: 'trusted_content', type: 'jsonb' })
  trustedContent: Record<string, unknown>;
}
