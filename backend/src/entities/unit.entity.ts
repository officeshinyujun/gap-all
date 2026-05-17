import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Subject } from './subject.entity';
import { StudyProgress } from './study-progress.entity';
import { Question } from './question.entity';

@Entity('units')
@Unique(['subjectId', 'unitNumber'])
export class Unit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'subject_id' })
  subjectId: string;

  @Column({ name: 'unit_number' })
  unitNumber: number;

  @Column()
  title: string;

  @ManyToOne(() => Subject, (subject) => subject.units)
  @JoinColumn({ name: 'subject_id' })
  subject: Subject;

  @OneToMany(() => StudyProgress, (sp) => sp.unit)
  progress: StudyProgress[];

  @OneToMany(() => Question, (q) => q.unit)
  questions: Question[];
}
