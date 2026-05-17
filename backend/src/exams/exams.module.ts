import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamsService } from './exams.service';
import { ExamsController } from './exams.controller';
import { ExamGeneratorService } from './exam-generator.service';
import { ExamRecord } from '../entities/exam-record.entity';
import { ExamItem } from '../entities/exam-item.entity';
import { Question } from '../entities/question.entity';
import { Subject } from '../entities/subject.entity';
import { Unit } from '../entities/unit.entity';
import { AiUsageLog } from '../entities/ai-usage-log.entity';
import { IncorrectRecord } from '../entities/incorrect-record.entity';
import { ExamGenerationJobsService } from './exam-generation-jobs.service';
import { TextbookModule } from '../textbook/textbook.module';
import { PromptsModule } from '../prompts/prompts.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExamRecord,
      ExamItem,
      Question,
      Subject,
      Unit,
      AiUsageLog,
      IncorrectRecord,
    ]),
    TextbookModule,
    PromptsModule,
    NotificationsModule,
  ],
  controllers: [ExamsController],
  providers: [ExamsService, ExamGeneratorService, ExamGenerationJobsService],
  exports: [ExamsService],
})
export class ExamsModule {}
