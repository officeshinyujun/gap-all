import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Subject } from './subject.entity';
import { Unit } from './unit.entity';
import { ExamItem } from './exam-item.entity';
import { Difficulty } from './exam-record.entity';
import type { QuestionGenerationLineage } from '../exams/reference-frame.types';

@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'subject_id' })
  subjectId: string;

  @Column({ name: 'unit_id' })
  unitId: string;

  @Column({ name: 'target_concept' })
  targetConcept: string;

  @Column({ name: 'item_type' })
  itemType: string;

  @Column({ type: 'varchar', length: 20 })
  difficulty: Difficulty;

  @Column({ name: 'recommended_template' })
  recommendedTemplate: string;

  @Index('IDX_questions_variant_group')
  @Column({ name: 'variant_group_id', nullable: true })
  variantGroupId?: string;

  @Column({ name: 'question_stem', type: 'text' })
  questionStem: string;

  @Column({ name: 'stimulus_data', type: 'jsonb' })
  stimulusData: object;

  @Column({ name: 'options_list', type: 'jsonb' })
  optionsList: string[];

  @Column({ name: 'combo_block', type: 'jsonb', nullable: true })
  comboBlock: {
    title: string;
    items: Array<{ key: string; text: string }>;
  } | null;

  @Column({ type: 'jsonb' })
  explanation: object;

  @Column({ name: 'correct_answer' })
  correctAnswer: number;

  @Column({
    name: 'set_group_id',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  setGroupId: string | null;

  @Column({ name: 'set_position', type: 'int', nullable: true, default: null })
  setPosition: number | null;

  @Column({
    name: 'generation_lineage',
    type: 'jsonb',
    nullable: true,
    default: null,
  })
  generationLineage: QuestionGenerationLineage | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Subject, (subject) => subject.questions)
  @JoinColumn({ name: 'subject_id' })
  subject: Subject;

  @ManyToOne(() => Unit, (unit) => unit.questions)
  @JoinColumn({ name: 'unit_id' })
  unit: Unit;

  @OneToMany(() => ExamItem, (item) => item.question)
  examItems: ExamItem[];
}
