import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('generation_exam_sessions')
@Index(['generationRunId'], { unique: true })
export class GenerationExamSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'generation_run_id', type: 'uuid' })
  generationRunId: string;

  @Column({ name: 'public_exam_id', type: 'uuid', nullable: true })
  publicExamId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
