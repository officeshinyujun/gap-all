import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiGenerationCandidate } from '../entities/ai-generation-candidate.entity';
import { AiGenerationRun } from '../entities/ai-generation-run.entity';
import { ExamItem } from '../entities/exam-item.entity';
import { ExamRecord, ExamSourceType } from '../entities/exam-record.entity';
import { Question } from '../entities/question.entity';
import { Unit } from '../entities/unit.entity';
import { CreateExamDto } from './dto/create-exam.dto';
import {
  AI_BLUEPRINT_PROMPT_VERSION,
  AI_BLUEPRINT_VALIDATOR_VERSION,
} from './ai-provider.adapter';
import { AiBlueprintService } from './ai-blueprint.service';
import {
  assertAiQuestionFamilyEnabled,
  isAiSubjectEnabled,
} from './ai-generation-feature';
import { AI_BLUEPRINT_VERSION } from './ai-blueprint.types';
import { AI_UNIT_PROFILE_VERSION } from './ai-unit-profile.service';
import type { ExamGenerationProgressReporter } from './exam-generation.utils';
import { AiQuestionGenerationService } from './ai-question-generation.service';

const AI_MODEL =
  process.env.OPENAI_AI_BLUEPRINT_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o';

@Injectable()
export class AiExamGenerationService {
  constructor(
    @InjectRepository(AiGenerationRun)
    private readonly runRepo: Repository<AiGenerationRun>,
    @InjectRepository(AiGenerationCandidate)
    private readonly candidateRepo: Repository<AiGenerationCandidate>,
    @InjectRepository(ExamRecord)
    private readonly examRepo: Repository<ExamRecord>,
    @InjectRepository(ExamItem)
    private readonly examItemRepo: Repository<ExamItem>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    private readonly blueprintService: AiBlueprintService,
    private readonly questionGenerationService: AiQuestionGenerationService,
  ) {}

  async generate(
    userId: string,
    dto: CreateExamDto,
    subjectTitle: string,
    subjectSlug: string,
    idempotencyKey: string,
    reportProgress?: ExamGenerationProgressReporter,
  ): Promise<string> {
    if (!isAiSubjectEnabled(subjectSlug)) {
      throw new ConflictException(
        '해당 과목의 AI 문항 생성이 비활성화되어 있습니다.',
      );
    }
    if (dto.aiQuestionFamily !== undefined) {
      assertAiQuestionFamilyEnabled(dto.aiQuestionFamily);
    }
    const run = await this.getOrCreateRun(userId, dto, idempotencyKey);
    if (run.status === 'completed' && run.examId !== null) {
      return run.examId;
    }
    if (run.status === 'running') {
      throw new ConflictException('AI 시험 생성 작업이 이미 실행 중입니다.');
    }

    run.status = 'running';
    run.stage = 'profile';
    run.progress = 10;
    await this.runRepo.save(run);
    try {
      const preview = await this.blueprintService.preview({
        subjectId: dto.subjectId,
        subjectSlug,
        startUnitNum: dto.startUnitNum,
        endUnitNum: dto.endUnitNum,
        difficulty: dto.difficulty,
        questionCount: dto.questionCount,
        targetConcepts: dto.targetConcepts,
        aiQuestionFamily: dto.aiQuestionFamily,
        seed: idempotencyKey,
        excludeSourceIds: await this.previousAiSourceIds(dto.subjectId),
      });
      await this.report(run, reportProgress, {
        stage: 'blueprint',
        progress: 20,
        message: 'AI 출제 계획을 구성했습니다.',
        completed: 0,
        total: dto.questionCount,
        attempt: 0,
        maxAttempts: 0,
      });
      if (preview.shortfall !== undefined) {
        throw new InternalServerErrorException({
          code: 'AI_BLUEPRINT_SHORTFALL',
          requestedCount: dto.questionCount,
          generatedCount: preview.blueprints.length,
          stageCounts: {
            source: preview.availableCount,
            planner: preview.blueprints.length,
            fidelity: 0,
            admission: 0,
          },
        });
      }

      const generated = await this.questionGenerationService.generate(
        preview.blueprints,
        (update) => this.report(run, reportProgress, update),
      );
      run.acceptedCount = generated.accepted.length;
      run.rejectedCount = generated.rejected.length;
      for (const accepted of generated.accepted) {
        const telemetry = accepted.candidate.telemetry;
        if (telemetry === undefined) continue;
        run.providerLatencyMs =
          (run.providerLatencyMs ?? 0) + telemetry.latencyMs;
        run.promptTokens =
          (run.promptTokens ?? 0) + (telemetry.usage?.promptTokens ?? 0);
        run.completionTokens =
          (run.completionTokens ?? 0) +
          (telemetry.usage?.completionTokens ?? 0);
        run.totalTokens =
          (run.totalTokens ?? 0) + (telemetry.usage?.totalTokens ?? 0);
      }
      await this.candidateRepo.save([
        ...generated.rejected.map((candidate) =>
          this.candidateRepo.create({
            runId: run.id,
            blueprintId: candidate.blueprintId,
            attempt: candidate.attempt,
            status: 'rejected',
            failureCode: candidate.code,
            fingerprint: null,
            candidate: null,
            validation:
              candidate.message === undefined
                ? null
                : { failureCode: candidate.code, message: candidate.message },
            providerModel: null,
            promptHash: null,
            latencyMs: null,
            providerUsage: null,
          }),
        ),
        ...generated.accepted.map((candidate) =>
          this.candidateRepo.create({
            runId: run.id,
            blueprintId: candidate.blueprint.id,
            attempt: candidate.attempt,
            status: 'accepted',
            failureCode: null,
            fingerprint: candidate.fingerprint,
            candidate: candidate.candidate,
            validation: candidate.validation,
            providerModel: candidate.candidate.telemetry?.model ?? null,
            promptHash: candidate.candidate.telemetry?.promptHash ?? null,
            latencyMs: candidate.candidate.telemetry?.latencyMs ?? null,
            providerUsage: candidate.candidate.telemetry?.usage ?? null,
          }),
        ),
      ]);
      if (generated.shortfall !== undefined) {
        throw new InternalServerErrorException({
          code: 'AI_RETRY_EXHAUSTED',
          requestedCount: generated.shortfall.requestedCount,
          generatedCount: generated.shortfall.generatedCount,
          stageCounts: {
            source: preview.availableCount,
            planner: preview.blueprints.length,
            fidelity: 0,
            admission: generated.accepted.length,
          },
          candidateCounts: {
            attempted: generated.rejected.length + generated.accepted.length,
            eligible: preview.blueprints.length,
            generated: generated.accepted.length,
            omittedEligibleCount: Math.max(
              0,
              preview.blueprints.length - generated.accepted.length,
            ),
          },
        });
      }

      await this.report(run, reportProgress, {
        stage: 'saving',
        progress: 96,
        message: '검증된 AI 문항을 저장하고 있습니다.',
        completed: generated.accepted.length,
        total: dto.questionCount,
        attempt: 1,
        maxAttempts: 1,
      });
      const examId = await this.saveExam(
        userId,
        dto,
        subjectTitle,
        generated.accepted,
        idempotencyKey,
      );
      run.status = 'completed';
      run.stage = 'completed';
      run.progress = 100;
      run.examId = examId;
      await this.runRepo.save(run);
      await reportProgress?.({
        stage: 'saving',
        progress: 100,
        status: 'success',
        message: 'AI 생성 문항을 저장했습니다.',
        completed: dto.questionCount,
        total: dto.questionCount,
        attempt: 1,
        maxAttempts: 1,
      });
      return examId;
    } catch (error: unknown) {
      run.status = 'failed';
      run.stage = 'failed';
      run.failureCode = failureCode(error);
      run.failureReason = 'AI 시험 생성에 실패했습니다.';
      await this.runRepo.save(run);
      throw error;
    }
  }

  private async previousAiSourceIds(subjectId: string): Promise<string[]> {
    const questionRepo = this.questionRepo as unknown as {
      find?: (options: { where: { subjectId: string } }) => Promise<Question[]>;
    };
    if (questionRepo.find === undefined) return [];
    const questions = await questionRepo.find({ where: { subjectId } });
    const ids = new Set<string>();
    for (const question of questions) {
      const lineage = question.generationLineage;
      if (lineage?.generationPath !== 'ai_blueprint') continue;
      for (const evidence of lineage.sourceEvidence) ids.add(evidence.sourceId);
    }
    return [...ids];
  }

  private async getOrCreateRun(
    userId: string,
    dto: CreateExamDto,
    idempotencyKey: string,
  ): Promise<AiGenerationRun> {
    const existing = await this.runRepo.findOne({ where: { idempotencyKey } });
    if (existing !== null) return existing;
    return this.runRepo.save(
      this.runRepo.create({
        idempotencyKey,
        userId,
        subjectId: dto.subjectId,
        status: 'pending',
        request: { ...dto },
        profileVersion: AI_UNIT_PROFILE_VERSION,
        blueprintVersion: AI_BLUEPRINT_VERSION,
        promptVersion: AI_BLUEPRINT_PROMPT_VERSION,
        validatorVersion: AI_BLUEPRINT_VALIDATOR_VERSION,
        progress: 0,
        stage: 'queued',
        acceptedCount: 0,
        rejectedCount: 0,
        providerLatencyMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        failureCode: null,
        failureReason: null,
        examId: null,
      }),
    );
  }

  private async report(
    run: AiGenerationRun,
    reportProgress: ExamGenerationProgressReporter | undefined,
    update: Parameters<NonNullable<ExamGenerationProgressReporter>>[0],
  ): Promise<void> {
    run.stage = update.stage;
    run.progress = Math.max(run.progress, Math.min(100, update.progress));
    run.acceptedCount = update.aiProgress?.accepted ?? run.acceptedCount;
    run.rejectedCount = update.aiProgress?.rejected ?? run.rejectedCount;
    await this.runRepo.save(run);
    await reportProgress?.(update);
  }

  private async saveExam(
    userId: string,
    dto: CreateExamDto,
    subjectTitle: string,
    accepted: Awaited<
      ReturnType<AiQuestionGenerationService['generate']>
    >['accepted'],
    generationNonce: string,
  ): Promise<string> {
    const title = `${subjectTitle} ${dto.startUnitNum}~${dto.endUnitNum}단원 (AI ${dto.difficulty})`;
    const exam = await this.examRepo.manager.transaction(async (manager) => {
      const questionRepo = manager.getRepository(Question);
      const unitRepo = manager.getRepository(Unit);
      const questions: Question[] = [];
      for (const item of accepted) {
        let unit = await unitRepo.findOne({
          where: {
            subjectId: dto.subjectId,
            unitNumber: item.blueprint.unitNumber,
          },
        });
        if (unit === null) {
          unit = await unitRepo.save(
            unitRepo.create({
              subjectId: dto.subjectId,
              unitNumber: item.blueprint.unitNumber,
              title: `${item.blueprint.unitNumber}단원`,
            }),
          );
        }
        questions.push(
          await questionRepo.save(
            questionRepo.create({
              subjectId: dto.subjectId,
              unitId: unit.id,
              targetConcept: item.question.targetConcept,
              itemType: item.question.itemType,
              difficulty: item.question.difficulty,
              recommendedTemplate: item.question.recommendedTemplate,
              variantGroupId: `${dto.subjectId}:${unit.id}:${item.question.targetConcept}:ai_blueprint`,
              questionStem: item.question.questionStem,
              stimulusData: item.question.stimulusData,
              optionsList: [...item.question.optionsList],
              comboBlock: null,
              explanation: item.question.explanation,
              correctAnswer: item.question.correctAnswer,
              setGroupId: null,
              setPosition: null,
              generationLineage: {
                generationPath: 'ai_blueprint',
                generationNonce,
                sourceEvidence: item.blueprint.sourceEvidence,
                blueprintVersion: item.blueprint.blueprintVersion,
                selectedTemplate: item.question.recommendedTemplate,
                promptVersion: AI_BLUEPRINT_PROMPT_VERSION,
                model: AI_MODEL,
                validatorVersion: AI_BLUEPRINT_VALIDATOR_VERSION,
                answerRuleId: item.blueprint.answerRule.id,
                validation: 'passed',
              },
            }),
          ),
        );
      }
      const savedExam = await manager.save(
        this.examRepo.create({
          userId,
          subjectId: dto.subjectId,
          title,
          startUnitNum: dto.startUnitNum,
          endUnitNum: dto.endUnitNum,
          difficulty: dto.difficulty,
          questionCount: questions.length,
          customPrompt: dto.customPrompt ?? null,
          sourceType: ExamSourceType.AI_BLUEPRINT,
        }),
      );
      await manager.save(
        questions.map((question, index) =>
          this.examItemRepo.create({
            examId: savedExam.id,
            questionId: question.id,
            orderIndex: index + 1,
          }),
        ),
      );
      return savedExam;
    });
    return exam.id;
  }
}

function failureCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'getResponse' in error &&
    typeof error.getResponse === 'function'
  ) {
    const response = error.getResponse() as unknown;
    if (
      typeof response === 'object' &&
      response !== null &&
      'code' in response &&
      typeof response.code === 'string'
    ) {
      return response.code;
    }
  }
  return 'AI_GENERATION_FAILED';
}
