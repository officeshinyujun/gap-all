import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('reference_questions')
@Index(['logicalSourceId', 'contentHash'], { unique: true })
@Index(['logicalSourceId'], { unique: true })
export class ReferenceQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'logical_source_id', type: 'varchar' })
  logicalSourceId: string;

  @Column({ name: 'content_hash', type: 'varchar' })
  contentHash: string;

  @Column({ type: 'varchar' })
  subject: string;

  @Column({ name: 'unit_number', type: 'int' })
  unitNumber: number;

  @Column({ name: 'unit_numbers', type: 'int', array: true, default: '{}' })
  unitNumbers: number[];

  @Column({ name: 'provenance_path', type: 'text' })
  provenancePath: string;

  @Column({ name: 'parse_version', type: 'varchar' })
  parseVersion: string;

  @Column({ name: 'source_payload', type: 'jsonb' })
  sourcePayload: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
