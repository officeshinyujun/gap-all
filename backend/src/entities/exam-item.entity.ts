import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ExamRecord } from './exam-record.entity';
import { Question } from './question.entity';

@Entity('exam_items')
export class ExamItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'exam_id' })
  examId: string;

  @Column({ name: 'question_id' })
  questionId: string;

  @Column({ name: 'order_index' })
  orderIndex: number;

  @Column({ name: 'user_answer', type: 'int', nullable: true })
  userAnswer: number | null;

  @Column({ name: 'is_correct', default: false })
  isCorrect: boolean;

  @ManyToOne(() => ExamRecord, (exam) => exam.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exam_id' })
  exam: ExamRecord;

  @ManyToOne(() => Question, (question) => question.examItems)
  @JoinColumn({ name: 'question_id' })
  question: Question;
}
