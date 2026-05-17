import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ExamsModule } from './exams/exams.module';
import { TextbookModule } from './textbook/textbook.module';
import { PromptsModule } from './prompts/prompts.module';
import { SubjectsModule } from './subjects/subjects.module';
import { StudyModule } from './study/study.module';
import { ChatModule } from './chat/chat.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Subject } from './entities/subject.entity';
import { Unit } from './entities/unit.entity';
import { StudyProgress } from './entities/study-progress.entity';
import { ExamRecord } from './entities/exam-record.entity';
import { ExamTag } from './entities/exam-tag.entity';
import { ExamItem } from './entities/exam-item.entity';
import { Question } from './entities/question.entity';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { IncorrectRecord } from './entities/incorrect-record.entity';
import { Notification } from './entities/notification.entity';
import { NotificationSetting } from './entities/notification-setting.entity';
import { PushSubscription } from './entities/push-subscription.entity';
import { ConceptBookmark } from './entities/concept-bookmark.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 30,
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [
          User,
          RefreshToken,
          Subject,
          Unit,
          StudyProgress,
          ExamRecord,
          ExamTag,
          ExamItem,
          Question,
          ChatSession,
          ChatMessage,
          AiUsageLog,
          IncorrectRecord,
          Notification,
          NotificationSetting,
          PushSubscription,
          ConceptBookmark,
        ],
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),
    AuthModule,
    UsersModule,
    ExamsModule,
    TextbookModule,
    PromptsModule,
    SubjectsModule,
    StudyModule,
    ChatModule,
    AdminModule,
    NotificationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
