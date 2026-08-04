import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('unit_exam_profiles')
@Index(['subjectSlug', 'unitNumber'], { unique: true })
export class UnitExamProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'subject_slug', type: 'varchar' })
  subjectSlug: string;

  @Column({ name: 'unit_number', type: 'int' })
  unitNumber: number;

  @Column({ name: 'profile_version', type: 'varchar', length: 32 })
  profileVersion: string;

  @Column({ name: 'source_fingerprint', type: 'varchar', length: 128 })
  sourceFingerprint: string;

  @Column({ name: 'textbook_fingerprint', type: 'varchar', length: 128 })
  textbookFingerprint: string;

  @Column({ type: 'jsonb' })
  profile: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
