import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudyService } from './study.service';
import { StudyController } from './study.controller';
import { StudyQuizGeneratorService } from './study-quiz-generator.service';
import { StudyProgress } from '../entities/study-progress.entity';
import { Unit } from '../entities/unit.entity';
import { Subject } from '../entities/subject.entity';
import { User } from '../entities/user.entity';
import { AiUsageLog } from '../entities/ai-usage-log.entity';
import { IncorrectRecord } from '../entities/incorrect-record.entity';
import { Question } from '../entities/question.entity';
import { ExamItem } from '../entities/exam-item.entity';
import { ConceptBookmark } from '../entities/concept-bookmark.entity';
import { UnitExamProfile } from '../entities/unit-exam-profile.entity';
import { TextbookModule } from '../textbook/textbook.module';
import { ExamsModule } from '../exams/exams.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudyProgress,
      Unit,
      Subject,
      User,
      AiUsageLog,
      IncorrectRecord,
      Question,
      ExamItem,
      ConceptBookmark,
      UnitExamProfile,
    ]),
    TextbookModule,
    ExamsModule,
  ],
  controllers: [StudyController],
  providers: [StudyService, StudyQuizGeneratorService],
  exports: [StudyService],
})
export class StudyModule {}
