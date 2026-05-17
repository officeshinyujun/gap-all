import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ExamRecord } from './exam-record.entity';

@Entity('exam_tags')
export class ExamTag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'exam_id' })
  examId: string;

  @Column({ name: 'tag_name' })
  tagName: string;

  @ManyToOne(() => ExamRecord, (exam) => exam.tags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exam_id' })
  exam: ExamRecord;
}
