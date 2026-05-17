import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Question } from './question.entity';
import { Subject } from './subject.entity';
import { Unit } from './unit.entity';

export enum IncorrectSource {
  EXAM = 'EXAM',
  BLANK_FILL = 'BLANK_FILL',
  INTERACTIVE_QUIZ = 'INTERACTIVE_QUIZ',
  PRACTICE_EXAM = 'PRACTICE_EXAM',
}

@Entity('incorrect_records')
@Unique(['userId', 'targetConcept', 'unitId', 'source'])
export class IncorrectRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'question_id', nullable: true })
  questionId: string | null;

  @Column({ name: 'subject_id' })
  subjectId: string;

  @Column({ name: 'unit_id' })
  unitId: string;

  @Column({ name: 'target_concept' })
  targetConcept: string;

  @Column({ type: 'varchar', length: 30 })
  source: IncorrectSource;

  @Column({ name: 'incorrect_count', default: 1 })
  incorrectCount: number;

  @Column({ name: 'consecutive_correct', default: 0 })
  consecutiveCorrect: number;

  @Column({ name: 'is_graduated', default: false })
  isGraduated: boolean;

  @Column({ name: 'last_incorrect_at', type: 'timestamp' })
  lastIncorrectAt: Date;

  @Column({ name: 'last_reviewed_at', type: 'timestamp', nullable: true })
  lastReviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Question, { nullable: true })
  @JoinColumn({ name: 'question_id' })
  question: Question | null;

  @ManyToOne(() => Subject)
  @JoinColumn({ name: 'subject_id' })
  subject: Subject;

  @ManyToOne(() => Unit)
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;
}
