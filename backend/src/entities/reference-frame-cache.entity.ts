import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ReferenceFrame } from '../exams/reference-frame.types';

@Entity('reference_frame_cache')
@Index(['sourceId', 'sourceHash'], { unique: true })
export class ReferenceFrameCache {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_id', type: 'varchar' })
  sourceId: string;

  @Column({ name: 'source_hash', type: 'varchar' })
  sourceHash: string;

  @Column({ type: 'varchar' })
  model: string;

  @Column({ name: 'contract_version', type: 'int', default: 1 })
  contractVersion: number;

  @Column({ name: 'archetype_fingerprint', type: 'varchar', default: '' })
  archetypeFingerprint: string;

  @Column({ type: 'jsonb' })
  frame: ReferenceFrame;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
