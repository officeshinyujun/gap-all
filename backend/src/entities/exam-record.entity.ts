import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Subject } from './subject.entity';
import { ExamTag } from './exam-tag.entity';
import { ExamItem } from './exam-item.entity';

export enum Difficulty {
  LOW = 'LOW',
  MIDDLE = 'MIDDLE',
  HIGH = 'HIGH',
  INTERGRATE = 'INTERGRATE',
}

export enum ExamSourceType {
  AI = 'ai',
  REFERENCE = 'reference',
  AI_BLUEPRINT = 'ai_blueprint',
}

@Entity('exam_records')
export class ExamRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'subject_id' })
  subjectId: string;

  @Column()
  title: string;

  @Column({ name: 'start_unit_num' })
  startUnitNum: number;

  @Column({ name: 'end_unit_num' })
  endUnitNum: number;

  @Column({ type: 'varchar', length: 20 })
  difficulty: Difficulty;

  @Column({ name: 'question_count' })
  questionCount: number;

  @Column({ name: 'custom_prompt', nullable: true, type: 'text' })
  customPrompt: string | null;

  @Column({
    name: 'source_type',
    type: 'varchar',
    length: 20,
    default: ExamSourceType.AI,
  })
  sourceType: ExamSourceType;

  @Column({ name: 'total_score', type: 'int', nullable: true })
  totalScore: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.exams, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Subject, (subject) => subject.exams)
  @JoinColumn({ name: 'subject_id' })
  subject: Subject;

  @OneToMany(() => ExamTag, (tag) => tag.exam, { cascade: true })
  tags: ExamTag[];

  @OneToMany(() => ExamItem, (item) => item.exam, { cascade: true })
  items: ExamItem[];
}
