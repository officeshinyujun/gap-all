import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Question } from './question.entity';
import { User } from './user.entity';

@Entity({ name: 'flagged_questions' })
export class FlaggedQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'question_id' })
  questionId: string;

  @ManyToOne(() => Question, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: Question;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string;

  @Column({ name: 'question_snapshot', type: 'jsonb', nullable: true })
  questionSnapshot: object;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
