import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('notification_settings')
@Unique(['userId'])
export class NotificationSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'reminder_enabled', default: true })
  reminderEnabled: boolean;

  @Column({ name: 'reminder_frequency_days', type: 'int', default: 1 })
  reminderFrequencyDays: number;

  @Column({ name: 'reminder_condition_days', type: 'int', default: 1 })
  reminderConditionDays: number;

  @Column({ name: 'reminder_time', type: 'varchar', default: '09:00' })
  reminderTime: string;

  @Column({ name: 'push_enabled', default: false })
  pushEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
