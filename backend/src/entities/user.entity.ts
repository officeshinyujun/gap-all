import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { RefreshToken } from './refresh-token.entity';
import { StudyProgress } from './study-progress.entity';
import { ExamRecord } from './exam-record.entity';
import { ChatSession } from './chat-session.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  provider: string | null;

  @Column({
    name: 'provider_id',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  providerId: string | null;

  @Column({ name: 'profile_image_url', type: 'varchar', nullable: true })
  profileImageUrl: string | null;

  @Column({ type: 'date', nullable: true })
  birthday: string | null;

  @Column({ name: 'study_streak_days', default: 0 })
  studyStreakDays: number;

  @Column({ type: 'varchar', default: 'user' })
  role: 'user' | 'admin';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => RefreshToken, (rt) => rt.user)
  refreshTokens: RefreshToken[];

  @OneToMany(() => StudyProgress, (sp) => sp.user)
  progress: StudyProgress[];

  @OneToMany(() => ExamRecord, (er) => er.user)
  exams: ExamRecord[];

  @OneToMany(() => ChatSession, (cs) => cs.user)
  chatSessions: ChatSession[];
}
