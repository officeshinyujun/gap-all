import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Unit } from './unit.entity';

export enum StudyMode {
  BASIC_CONCEPT = 'BASIC_CONCEPT',
  BLANK_FILL = 'BLANK_FILL',
  INTERACTIVE_QUIZ = 'INTERACTIVE_QUIZ',
  PRACTICE_EXAM = 'PRACTICE_EXAM',
  REVIEW_INCORRECT = 'REVIEW_INCORRECT',
}

@Entity('study_progress')
@Unique(['userId', 'unitId', 'studyMode'])
export class StudyProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'unit_id' })
  unitId: string;

  @Column({ type: 'varchar', length: 30, name: 'study_mode' })
  studyMode: StudyMode;

  @Column({ name: 'progress_percent', default: 0 })
  progressPercent: number;

  @UpdateDateColumn({ name: 'last_studied_at' })
  lastStudiedAt: Date;

  @ManyToOne(() => User, (user) => user.progress, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Unit, (unit) => unit.progress)
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;
}
