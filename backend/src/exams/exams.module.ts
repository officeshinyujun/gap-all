import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamsService } from './exams.service';
import { ExamsController } from './exams.controller';
import { ExamGeneratorService } from './exam-generator.service';
import { PatternMatcherService } from './pattern-matcher.service';
import { ExamRecord } from '../entities/exam-record.entity';
import { ExamItem } from '../entities/exam-item.entity';
import { Question } from '../entities/question.entity';
import { Subject } from '../entities/subject.entity';
import { Unit } from '../entities/unit.entity';
import { AiUsageLog } from '../entities/ai-usage-log.entity';
import { IncorrectRecord } from '../entities/incorrect-record.entity';
import { FlaggedQuestion } from '../entities/flagged-question.entity';
import { ReferenceQuestion } from '../entities/reference-question.entity';
import { ReferenceFrameCache } from '../entities/reference-frame-cache.entity';
import { QuestionSeenRecord } from '../entities/question-seen-record.entity';
import { UnitExamProfile } from '../entities/unit-exam-profile.entity';
import { AiGenerationRun } from '../entities/ai-generation-run.entity';
import { AiGenerationCandidate } from '../entities/ai-generation-candidate.entity';
import { AiReferenceAnalysis } from '../entities/ai-reference-analysis.entity';
import { GenerationJob } from '../entities/generation-job.entity';
import { ExamGenerationJobsService } from './exam-generation-jobs.service';
import { ExamGenerationCooldownService } from './exam-generation-cooldown.service';
import { SimilarityValidatorService } from './similarity-validator.service';
import { ExamRegeneratorService } from './exam-regenerator.service';
import { ReferenceFrameGenerationService } from './reference-frame-generation.service';
import { SimplyReferenceGenerationService } from './simply-reference-generation.service';
import { TextbookModule } from '../textbook/textbook.module';
import { PromptsModule } from '../prompts/prompts.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiUnitProfileService } from './ai-unit-profile.service';
import { AiBlueprintService } from './ai-blueprint.service';
import { AiProviderAdapter } from './ai-provider.adapter';
import {
  AI_QUESTION_CANDIDATE_PROVIDER,
  AiQuestionGenerationService,
} from './ai-question-generation.service';
import { AiExamGenerationService } from './ai-exam-generation.service';

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
      FlaggedQuestion,
      ReferenceQuestion,
      ReferenceFrameCache,
      QuestionSeenRecord,
      UnitExamProfile,
      AiGenerationRun,
      AiGenerationCandidate,
      AiReferenceAnalysis,
      GenerationJob,
    ]),
    TextbookModule,
    PromptsModule,
    NotificationsModule,
  ],
  controllers: [ExamsController],
  providers: [
    ExamsService,
    ExamGeneratorService,
    ExamRegeneratorService,
    ReferenceFrameGenerationService,
    SimplyReferenceGenerationService,
    ExamGenerationJobsService,
    ExamGenerationCooldownService,
    PatternMatcherService,
    SimilarityValidatorService,
    AiUnitProfileService,
    AiBlueprintService,
    AiProviderAdapter,
    {
      provide: AI_QUESTION_CANDIDATE_PROVIDER,
      useExisting: AiProviderAdapter,
    },
    AiQuestionGenerationService,
    AiExamGenerationService,
  ],
  exports: [ExamsService, AiUnitProfileService],
})
export class ExamsModule {}
