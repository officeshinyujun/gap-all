import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
  aiModelForRole,
} from './ai-provider.adapter';
import { AiBlueprintService } from './ai-blueprint.service';
import {
  assertAiQuestionFamilyEnabled,
  isAiSubjectEnabled,
} from './ai-generation-feature';
import { AI_BLUEPRINT_VERSION } from './ai-blueprint.types';
import { AI_UNIT_PROFILE_VERSION } from './ai-unit-profile.service';
import type { ExamGenerationProgressReporter } from './exam-generation.utils';
import {
  AiQuestionGenerationService,
  aiQuestionStructuralFingerprint,
} from './ai-question-generation.service';

const AI_MODEL = aiModelForRole('candidate');
const AI_JOB_TIMEOUT_MS = Number(process.env.AI_JOB_TIMEOUT_MS) || 900_000;

@Injectable()
export class AiExamGenerationService {
  private readonly logger = new Logger(AiExamGenerationService.name);

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
    isCanceled?: () => boolean,
  ): Promise<string> {
    if (!isAiSubjectEnabled(subjectSlug)) {
      throw new ConflictException(
        '해당 과목의 AI 문항 생성이 비활성화되어 있습니다.',
      );
    }
    await this.assertAiTelemetrySchema();
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
        // AI creates a new variant from reference evidence; source reuse is
        // intentionally allowed here. Reference-only generation owns source
        // deduplication in ExamsService.
        excludeSourceIds: [],
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
        if (preview.blueprints.length === 0) {
          throw new InternalServerErrorException({
            code: 'AI_BLUEPRINT_SHORTFALL',
            requestedCount: dto.questionCount,
            generatedCount: 0,
            stageCounts: {
              source: preview.availableCount,
              planner: 0,
              fidelity: 0,
              admission: 0,
            },
            diagnostics: preview.diagnostics,
          });
        }
      }

      const abortController = new AbortController();
      const previousFingerprints =
        await this.previousAiQuestionFingerprints(
          userId,
          dto.subjectId,
          dto.startUnitNum,
          dto.endUnitNum,
        );
      const cancellationPoll = setInterval(() => {
        if (isCanceled?.()) abortController.abort();
      }, 250);
      let generated;
      try {
        generated = await this.questionGenerationService.generate(
          preview.blueprints,
          (update) => this.report(run, reportProgress, update),
          dto.questionCount,
          Date.now() + AI_JOB_TIMEOUT_MS,
          isCanceled,
          abortController.signal,
          previousFingerprints.exact,
          previousFingerprints.structural,
        );
      } finally {
        clearInterval(cancellationPoll);
      }
      run.acceptedCount = generated.accepted.length;
      run.rejectedCount = generated.rejected.length;
      run.rejectionsByTemplate = generated.rejectionsByTemplate ?? null;
      run.rejectionsByCode = generated.rejectionsByCode ?? null;
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
        ...generated.rejected
          .filter(
            (candidate) =>
              !generated.accepted.some(
                (accepted) =>
                  accepted.blueprint.id === candidate.blueprintId &&
                  accepted.attempt === candidate.attempt,
              ),
          )
          .map((candidate) =>
            this.candidateRepo.create({
              runId: run.id,
              blueprintId: candidate.blueprintId,
              template: candidate.template,
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
            template: candidate.blueprint.template,
            attempt: candidate.attempt,
            status: 'accepted',
            failureCode: null,
            fingerprint: candidate.fingerprint,
            candidate: candidate.candidate,
            validation: {
              ...candidate.validation,
              structuralFingerprint: aiQuestionStructuralFingerprint(
                candidate.blueprint,
                candidate.candidate,
              ),
            },
            providerModel: candidate.candidate.telemetry?.model ?? null,
            promptHash: candidate.candidate.telemetry?.promptHash ?? null,
            latencyMs: candidate.candidate.telemetry?.latencyMs ?? null,
            providerUsage: candidate.candidate.telemetry?.usage ?? null,
          }),
        ),
      ]);
      if (generated.shortfall !== undefined) {
        if (generated.accepted.length === 0) {
          throw new InternalServerErrorException({
            code: 'AI_RETRY_EXHAUSTED',
            requestedCount: generated.shortfall.requestedCount,
            generatedCount: 0,
            stageCounts: {
              source: preview.availableCount,
              planner: preview.blueprints.length,
              fidelity: 0,
              admission: 0,
            },
            candidateCounts: {
              attempted: generated.rejected.length,
              eligible: preview.blueprints.length,
              generated: 0,
              omittedEligibleCount: preview.blueprints.length,
            },
            rejectionsByTemplate: generated.rejectionsByTemplate,
            rejectionsByCode: generated.rejectionsByCode,
          });
        }
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
      if (isCanceled?.()) {
        throw new InternalServerErrorException({
          code: 'AI_JOB_CANCELED',
          message: 'AI 시험 생성 작업이 취소되었습니다.',
        });
      }
      if (generated.accepted.length === 0) {
        throw new InternalServerErrorException({
          code: 'AI_RETRY_EXHAUSTED',
          message: '검증을 통과한 AI 문항이 없어 시험을 저장하지 않았습니다.',
          requestedCount: dto.questionCount,
          generatedCount: generated.accepted.length,
          stageCounts: {
            source: preview.availableCount,
            planner: preview.blueprints.length,
            fidelity: 0,
            admission: 0,
          },
          rejectionsByTemplate: generated.rejectionsByTemplate,
          rejectionsByCode: generated.rejectionsByCode,
        });
      }
      let examId: string;
      try {
        examId = await this.saveExam(
          userId,
          dto,
          subjectTitle,
          generated.accepted,
          idempotencyKey,
        );
      } catch (error: unknown) {
        this.logger.error(
          `AI exam persistence failed: ${persistenceErrorSummary(error)}`,
        );
        throw new InternalServerErrorException({
          code: 'AI_PERSISTENCE_FAILED',
          message: '검증된 AI 문항은 생성됐지만 시험 저장에 실패했습니다.',
        });
      }
      run.status = 'completed';
      run.stage = 'completed';
      run.progress = 100;
      run.examId = examId;
      const isPartial = generated.accepted.length < dto.questionCount;
      if (isPartial) {
        run.failureCode = 'AI_RETRY_EXHAUSTED';
        run.failureReason = `검증 통과 문항 ${generated.accepted.length}/${dto.questionCount}개만 저장했습니다.`;
      }
      await this.runRepo.save(run);
      await reportProgress?.({
        stage: 'saving',
        progress: 100,
        status: 'success',
        message: isPartial
          ? `검증 통과 문항 ${generated.accepted.length}/${dto.questionCount}개를 저장했습니다.`
          : 'AI 생성 문항을 저장했습니다.',
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

  private async previousAiQuestionFingerprints(
    userId: string,
    subjectId: string,
    startUnitNum: number,
    endUnitNum: number,
  ): Promise<{
    exact: readonly string[];
    structural: readonly string[];
  }> {
    if (typeof this.runRepo.find !== 'function') {
      return { exact: [], structural: [] };
    }
    if (typeof this.candidateRepo.find !== 'function') {
      return { exact: [], structural: [] };
    }
    const runs = await this.runRepo.find({
      where: { userId, subjectId, status: 'completed' },
    });
    const runIds = runs
      .filter((run) => {
        const request = run.request;
        return (
          Number(request.startUnitNum) <= endUnitNum &&
          Number(request.endUnitNum) >= startUnitNum
        );
      })
      .map((run) => run.id);
    if (runIds.length === 0) return { exact: [], structural: [] };
    const candidates = await this.candidateRepo.find({
      where: { runId: In(runIds), status: 'accepted' },
    });
    return {
      exact: [
        ...new Set(
          candidates
            .map((candidate) => candidate.fingerprint)
            .filter((fingerprint): fingerprint is string => fingerprint !== null),
        ),
      ],
      structural: [
        ...new Set(
          candidates
            .map((candidate) => candidate.validation?.structuralFingerprint)
            .filter(
              (fingerprint): fingerprint is string =>
                typeof fingerprint === 'string',
            ),
        ),
      ],
    };
  }

  private async assertAiTelemetrySchema(): Promise<void> {
    const manager = this.runRepo.manager as
      | { query?: (sql: string) => Promise<readonly { count: string }[]> }
      | undefined;
    if (manager?.query === undefined) return;
    const rows = await manager.query(
      `SELECT COUNT(*)::text AS count FROM information_schema.columns WHERE table_name IN ('ai_generation_runs', 'ai_generation_candidates') AND column_name IN ('rejections_by_template', 'template')`,
    );
    if (rows[0]?.count !== '2') {
      throw new InternalServerErrorException({
        code: 'AI_SCHEMA_UNAVAILABLE',
        message: 'AI 생성 telemetry migration이 적용되지 않았습니다.',
      });
    }
  }

  private async getOrCreateRun(
    userId: string,
    dto: CreateExamDto,
    idempotencyKey: string,
  ): Promise<AiGenerationRun> {
    const existing = await this.runRepo.findOne({ where: { idempotencyKey } });
    if (existing !== null && existing.status !== 'failed') return existing;
    if (existing !== null) {
      idempotencyKey = `${idempotencyKey}:retry:${randomUUID()}`;
    }
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
              comboBlock: item.question.comboBlock as any,
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

function persistenceErrorSummary(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? ` code=${error.code}`
      : '';
  return `${error.name}: ${error.message}${code}`;
}
