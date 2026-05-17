import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('textbook_chunks')
@Index(['subjectSlug', 'unitNumber'])
export class TextbookChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'subject_slug', type: 'varchar', length: 50 })
  subjectSlug: string;

  @Column({ name: 'unit_number', type: 'int' })
  unitNumber: number;

  @Column({ name: 'chunk_index', type: 'int' })
  chunkIndex: number;

  @Column({ type: 'text' })
  content: string;

  // pgvector: 1536차원 (text-embedding-3-small)
  @Column({
    type: 'text',
    name: 'embedding',
    nullable: true,
  })
  embeddingRaw: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
