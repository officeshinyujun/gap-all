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
import { SupabaseModule } from './supabase/supabase.module';
import { ReportsModule } from './reports/reports.module';
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Subject } from './entities/subject.entity';
import { Unit } from './entities/unit.entity';
import { StudyProgress } from './entities/study-progress.entity';
import { ExamRecord } from './entities/exam-record.entity';
import { ExamTag } from './entities/exam-tag.entity';
import { ExamItem } from './entities/exam-item.entity';
import { Question } from './entities/question.entity';
import { ReferenceQuestion } from './entities/reference-question.entity';
import { ReferenceFrameCache } from './entities/reference-frame-cache.entity';
import { GenerationRun } from './entities/generation-run.entity';
import { GeneratedQuestion } from './entities/generated-question.entity';
import { GenerationExamSession } from './entities/generation-exam-session.entity';
import { GenerationExamItem } from './entities/generation-exam-item.entity';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { IncorrectRecord } from './entities/incorrect-record.entity';
import { Notification } from './entities/notification.entity';
import { NotificationSetting } from './entities/notification-setting.entity';
import { PushSubscription } from './entities/push-subscription.entity';
import { ConceptBookmark } from './entities/concept-bookmark.entity';
import { FlaggedQuestion } from './entities/flagged-question.entity';
import { QuestionSeenRecord } from './entities/question-seen-record.entity';
import { UnitExamProfile } from './entities/unit-exam-profile.entity';
import { AiGenerationRun } from './entities/ai-generation-run.entity';
import { AiGenerationCandidate } from './entities/ai-generation-candidate.entity';
import { AiReferenceAnalysis } from './entities/ai-reference-analysis.entity';
import { GenerationJob } from './entities/generation-job.entity';

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
      useFactory: (config: ConfigService) => {
        const dbProvider = process.env.DB_PROVIDER || 'local';
        const isSupabase = dbProvider === 'supabase';
        const databaseUrl = isSupabase
          ? config.get<string>('DATABASE_SUPABASE_URL')
          : config.get<string>('DATABASE_LOCAL_URL');
        return {
          type: 'postgres',
          url: databaseUrl,
          ssl: isSupabase ? { rejectUnauthorized: false } : false,
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
            ReferenceQuestion,
            ReferenceFrameCache,
            GenerationRun,
            GeneratedQuestion,
            GenerationExamSession,
            GenerationExamItem,
            ChatSession,
            ChatMessage,
            AiUsageLog,
            IncorrectRecord,
            Notification,
            NotificationSetting,
            PushSubscription,
            ConceptBookmark,
            FlaggedQuestion,
            QuestionSeenRecord,
            UnitExamProfile,
            AiGenerationRun,
            AiGenerationCandidate,
            AiReferenceAnalysis,
            GenerationJob,
          ],
          synchronize: config.get<string>('NODE_ENV') !== 'production',
          logging:
            config.get<string>('NODE_ENV') === 'development' &&
            process.env.TYPEORM_LOGGING !== 'false',
        };
      },
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
    SupabaseModule,
    ReportsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
