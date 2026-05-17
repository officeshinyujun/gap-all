import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Unit } from './unit.entity';
import { ExamRecord } from './exam-record.entity';
import { Question } from './question.entity';
import { ChatSession } from './chat-session.entity';

@Entity('subjects')
export class Subject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  title: string;

  @OneToMany(() => Unit, (unit) => unit.subject)
  units: Unit[];

  @OneToMany(() => ExamRecord, (er) => er.subject)
  exams: ExamRecord[];

  @OneToMany(() => Question, (q) => q.subject)
  questions: Question[];

  @OneToMany(() => ChatSession, (cs) => cs.subject)
  chatSessions: ChatSession[];
}
