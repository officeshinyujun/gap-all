import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { ChatSession } from './chat-session.entity';

export enum ChatSender {
  USER = 'USER',
  AI = 'AI',
}

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chat_session_id' })
  chatSessionId: string;

  @Column({ type: 'varchar', length: 10 })
  sender: ChatSender;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'similar_questions', type: 'jsonb', nullable: true })
  similarQuestions: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => ChatSession, (session) => session.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'chat_session_id' })
  chatSession: ChatSession;
}
