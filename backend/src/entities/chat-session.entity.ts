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
import { ChatMessage } from './chat-message.entity';

@Entity('chat_sessions')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'subject_id', type: 'varchar', nullable: true })
  subjectId: string | null;

  @Column()
  title: string;

  @Column({ name: 'search_scope', type: 'varchar', nullable: true })
  searchScope: string | null;

  @Column({ name: 'start_unit', type: 'int', nullable: true })
  startUnit: number | null;

  @Column({ name: 'end_unit', type: 'int', nullable: true })
  endUnit: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.chatSessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Subject, (subject) => subject.chatSessions, {
    nullable: true,
  })
  @JoinColumn({ name: 'subject_id' })
  subject: Subject | null;

  @OneToMany(() => ChatMessage, (msg) => msg.chatSession, { cascade: true })
  messages: ChatMessage[];
}
