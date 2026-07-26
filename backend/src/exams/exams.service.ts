import {
  HttpException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ExamRecord, ExamSourceType } from '../entities/exam-record.entity';
import { ExamItem } from '../entities/exam-item.entity';
import { Subject } from '../entities/subject.entity';
import {
  IncorrectRecord,
  IncorrectSource,
} from '../entities/incorrect-record.entity';
import { FlaggedQuestion } from '../entities/flagged-question.entity';
import { ExamGeneratorService } from './exam-generator.service';
import { ReferenceFrameGenerationService } from './reference-frame-generation.service';
import {
  SimplyReferenceGenerationService,
  simplyReferenceFingerprint,
} from './simply-reference-generation.service';
import { StimulusNormalizer } from './stimulus-normalizer';
import { TextbookService } from '../textbook/textbook.service';
import { CreateExamDto } from './dto/create-exam.dto';
import {
  ExamGenerationJobsService,
  type ExamGenerationJobFailure,
  type ExamGenerationShortfall,
} from './exam-generation-jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../entities/notification.entity';
import type { ExamGenerationProgressReporter } from './exam-generation.utils';
import { Question } from '../entities/question.entity';
import { ReferenceFrameCache } from '../entities/reference-frame-cache.entity';
import { Unit } from '../entities/unit.entity';
import {
  ReferenceJobDeadline,
  ReferenceJobDeadlineExceededError,
} from './reference-job-deadline';
import { ReferenceFidelitySpecError } from './reference-fidelity-spec';

const REFERENCE_JOB_TIMEOUT_MS =
  Number(process.env.REFERENCE_JOB_TIMEOUT_MS) || 360_000;

function jobFailure(error: unknown): ExamGenerationJobFailure {
  if (error instanceof ReferenceJobDeadlineExceededError) {
    return {
      code: 'REFERENCE_GENERATION_TIMEOUT',
      message: '참조 시험 생성 시간이 초과되었습니다.',
    };
  }
  if (error instanceof ReferenceFidelitySpecError) {
    return {
      code: 'REFERENCE_FIDELITY_FAILED',
      message: '참조 문항 검증에 실패했습니다.',
    };
  }
  const shortfall = referenceGenerationShortfall(error);
  if (shortfall !== undefined) {
    return {
      code: 'REFERENCE_GENERATION_SHORTFALL',
      message: '참조 문항 생성에 실패했습니다.',
      shortfall,
    };
  }
  if (!(error instanceof HttpException)) {
    return {
      code: 'EXAM_GENERATION_FAILED',
      message: '시험 생성에 실패했습니다.',
    };
  }
  const response = error.getResponse();
  if (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    typeof response.code === 'string'
  ) {
    return { code: response.code, message: '참조 문항 생성에 실패했습니다.' };
  }
  return {
    code: 'EXAM_GENERATION_FAILED',
    message: '시험 생성에 실패했습니다.',
  };
}

function synchronousReferenceFailure(
  error: unknown,
): InternalServerErrorException {
  if (error instanceof ReferenceJobDeadlineExceededError) {
    return new InternalServerErrorException({
      code: 'REFERENCE_GENERATION_TIMEOUT',
      message: '참조 시험 생성 시간이 초과되었습니다.',
    });
  }
  if (error instanceof ReferenceFidelitySpecError) {
    return new InternalServerErrorException({
      code: 'REFERENCE_FIDELITY_FAILED',
      message: '참조 문항 검증에 실패했습니다.',
    });
  }
  const shortfall = referenceGenerationShortfall(error);
  if (shortfall !== undefined) {
    return new InternalServerErrorException({
      code: 'REFERENCE_GENERATION_SHORTFALL',
      ...shortfall,
    });
  }
  return new InternalServerErrorException({
    code: 'EXAM_GENERATION_FAILED',
    message: '시험 생성에 실패했습니다.',
  });
}

function referenceGenerationShortfall(
  error: unknown,
): ExamGenerationShortfall | undefined {
  if (!(error instanceof HttpException)) return undefined;
  const response = error.getResponse();
  if (
    !isRecord(response) ||
    response.code !== 'REFERENCE_GENERATION_SHORTFALL'
  ) {
    return undefined;
  }
  if (
    !isCount(response.requestedCount) ||
    !isCount(response.generatedCount) ||
    !isRecord(response.stageCounts) ||
    !isCount(response.stageCounts.source) ||
    !isCount(response.stageCounts.planner) ||
    !isCount(response.stageCounts.fidelity)
  ) {
    return undefined;
  }
  const admission = response.stageCounts.admission;
  if (admission !== undefined && !isCount(admission)) return undefined;
  const candidateCounts = response.candidateCounts;
  if (
    candidateCounts !== undefined &&
    !isReferenceCandidateCounts(candidateCounts)
  ) {
    return undefined;
  }
  return {
    requestedCount: response.requestedCount,
    generatedCount: response.generatedCount,
    stageCounts: {
      source: response.stageCounts.source,
      planner: response.stageCounts.planner,
      fidelity: response.stageCounts.fidelity,
      ...(admission === undefined ? {} : { admission }),
    },
    ...(candidateCounts === undefined
      ? {}
      : {
          candidateCounts: {
            attempted: candidateCounts.attempted,
            eligible: candidateCounts.eligible,
            generated: candidateCounts.generated,
            omittedEligibleCount: candidateCounts.omittedEligibleCount,
          },
        }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isReferenceCandidateCounts(
  value: unknown,
): value is NonNullable<ExamGenerationShortfall['candidateCounts']> {
  return (
    isRecord(value) &&
    isCount(value.attempted) &&
    isCount(value.eligible) &&
    isCount(value.generated) &&
    isCount(value.omittedEligibleCount)
  );
}

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);
  private readonly normalizer = new StimulusNormalizer();

  constructor(
    @InjectRepository(ExamRecord)
    private readonly examRepo: Repository<ExamRecord>,
    @InjectRepository(ExamItem)
    private readonly examItemRepo: Repository<ExamItem>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(IncorrectRecord)
    private readonly incorrectRecordRepo: Repository<IncorrectRecord>,
    @InjectRepository(FlaggedQuestion)
    private readonly flaggedQuestionRepo: Repository<FlaggedQuestion>,
    private readonly examGeneratorService: ExamGeneratorService,
    private readonly referenceFrameGenerationService: ReferenceFrameGenerationService,
    private readonly simplyReferenceGenerationService: SimplyReferenceGenerationService,
    private readonly textbookService: TextbookService,
    private readonly examGenerationJobsService: ExamGenerationJobsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ============================================================
  // 핵심 개념 조회
  // ============================================================
  async getConcepts(
    subjectId: string,
    startUnitNum: number,
    endUnitNum: number,
  ) {
    const subject = await this.subjectRepo.findOne({
      where: { id: subjectId },
    });
    if (!subject) throw new NotFoundException('과목을 찾을 수 없습니다.');

    return this.textbookService.getConcepts(
      subject.slug,
      startUnitNum,
      endUnitNum,
    );
  }

  getConceptsBySlug(
    subjectSlug: string,
    startUnitNum: number,
    endUnitNum: number,
  ) {
    return this.textbookService.getConcepts(
      subjectSlug,
      startUnitNum,
      endUnitNum,
    );
  }

  // ============================================================
  // 시험 생성
  // ============================================================
  async create(userId: string, dto: CreateExamDto) {
    const subject = await this.subjectRepo.findOne({
      where: { id: dto.subjectId },
    });
    if (!subject) throw new NotFoundException('과목을 찾을 수 없습니다.');

    if (dto.sourceType === 'simply_reference') {
      try {
        return await this.createSimplyReferenceExam(
          userId,
          dto,
          subject.title,
          subject.slug,
        );
      } catch (error) {
        throw synchronousReferenceFailure(error);
      }
    }

    if (dto.sourceType !== 'ai') {
      try {
        return await this.createReferenceFrameExam(
          userId,
          dto,
          subject.title,
          subject.slug,
        );
      } catch (error) {
        throw synchronousReferenceFailure(error);
      }
    }

    const questions = await this.examGeneratorService.generate(
      dto.subjectId,
      subject.slug,
      dto.startUnitNum,
      dto.endUnitNum,
      dto.difficulty,
      dto.questionCount,
      dto.customPrompt,
      dto.targetConcepts,
      undefined,
      userId,
      dto.excludePrevious,
    );

    const title = `${subject.title} ${dto.startUnitNum}~${dto.endUnitNum}단원 (${dto.difficulty})`;
    const exam = await this.examRepo.manager.transaction(async (manager) => {
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
          sourceType: ExamSourceType.AI,
        }),
      );
      const items = questions.map((q, idx) =>
        this.examItemRepo.create({
          examId: savedExam.id,
          questionId: q.id,
          orderIndex: idx + 1,
        }),
      );
      await manager.save(items);
      return savedExam;
    });

    return this.findOne(userId, exam.id);
  }

  async createJob(userId: string, dto: CreateExamDto) {
    const subject = await this.subjectRepo.findOne({
      where: { id: dto.subjectId },
    });
    if (!subject) throw new NotFoundException('과목을 찾을 수 없습니다.');

    const job = this.examGenerationJobsService.create(userId, dto);

    void this.runJob(job.id, userId, dto).catch((error: unknown) => {
      const stack = error instanceof Error ? error.stack : undefined;
      const failure = jobFailure(error);
      this.logger.error(`[EXAM-JOB] ${job.id} failed: ${failure.code}`, stack);
      this.examGenerationJobsService.fail(job.id, userId, failure);
    });

    return this.examGenerationJobsService.toReceipt(job);
  }

  getJob(userId: string, jobId: string) {
    return this.examGenerationJobsService.toReceipt(
      this.examGenerationJobsService.getForUser(jobId, userId),
    );
  }

  removeJob(userId: string, jobId: string) {
    this.examGenerationJobsService.removeForUser(jobId, userId);
    return { removed: true };
  }

  // ============================================================
  // 시험 목록 조회
  // ============================================================
  async findAll(userId: string, userRole: string, subjectSlug?: string) {
    const qb = this.examRepo
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.subject', 'subject')
      .leftJoinAndSelect('exam.tags', 'tags')
      .orderBy('exam.createdAt', 'DESC');

    if (userRole !== 'admin') {
      qb.where('exam.userId = :userId', { userId });
    }

    if (subjectSlug) {
      qb.andWhere('subject.slug = :slug', { slug: subjectSlug });
    }

    return qb.getMany();
  }

  // ============================================================
  // 시험 상세 조회 (문항 포함)
  // ============================================================
  async findOne(userId: string, examId: string, userRole?: string) {
    const exam = await this.examRepo.findOne({
      where: { id: examId },
      relations: [
        'subject',
        'tags',
        'items',
        'items.question',
        'items.question.unit',
      ],
      order: { items: { orderIndex: 'ASC' } },
    });

    if (!exam) throw new NotFoundException('시험을 찾을 수 없습니다.');
    if (exam.userId !== userId && userRole !== 'admin')
      throw new ForbiddenException('접근 권한이 없습니다.');

    // 시험지 렌더링 시 정답 숨김
    const safeItems = exam.items.map((item) => ({
      id: item.id,
      orderIndex: item.orderIndex,
      userAnswer: item.userAnswer,
      isCorrect: item.isCorrect,
      unitNumber: item.question.unit?.unitNumber ?? null,
      targetConcept: item.question.targetConcept,
      question: {
        id: item.question.id,
        targetConcept: item.question.targetConcept,
        itemType: item.question.itemType,
        difficulty: item.question.difficulty,
        questionStem: item.question.questionStem,
        ...(() => {
          const { stimulusData, effectiveTemplate } =
            this.normalizer.normalizeStimulusWithTemplate(
              item.question.stimulusData,
              item.question.recommendedTemplate,
              item.question.comboBlock,
            );
          return { stimulusData, recommendedTemplate: effectiveTemplate };
        })(),
        optionsList: item.question.optionsList,
        comboBlock: item.question.comboBlock,
        setGroupId: item.question.setGroupId,
        setPosition: item.question.setPosition,
        ...(item.userAnswer !== null
          ? {
              correctAnswer: item.question.correctAnswer,
              explanation: item.question.explanation,
            }
          : {}),
      },
    }));

    return { ...exam, items: safeItems };
  }

  // ============================================================
  // 시험 삭제
  // ============================================================
  async remove(userId: string, examId: string) {
    const exam = await this.examRepo.findOne({ where: { id: examId } });
    if (!exam) throw new NotFoundException('시험을 찾을 수 없습니다.');
    if (exam.userId !== userId)
      throw new ForbiddenException('접근 권한이 없습니다.');

    await this.examRepo.remove(exam);
    return { message: '시험이 삭제되었습니다.' };
  }

  // ============================================================
  // 답안 저장 (채점 없음, 중간 저장)
  // ============================================================
  async saveAnswers(
    userId: string,
    examId: string,
    answers: { examItemId: string; answer: number }[],
  ) {
    const exam = await this.examRepo.findOne({
      where: { id: examId },
      relations: ['items'],
    });
    if (!exam) throw new NotFoundException('시험을 찾을 수 없습니다.');
    if (exam.userId !== userId)
      throw new ForbiddenException('접근 권한이 없습니다.');

    for (const ans of answers) {
      const item = exam.items.find((i) => i.id === ans.examItemId);
      if (!item) continue;
      item.userAnswer = ans.answer;
      await this.examItemRepo.save(item);
    }
    return { saved: answers.length };
  }

  // ============================================================
  // 답안 제출 + 채점
  // ============================================================
  async submit(
    userId: string,
    examId: string,
    answers: { examItemId: string; answer: number }[],
  ) {
    const exam = await this.examRepo.findOne({
      where: { id: examId },
      relations: ['items', 'items.question'],
    });
    if (!exam) throw new NotFoundException('시험을 찾을 수 없습니다.');
    if (exam.userId !== userId)
      throw new ForbiddenException('접근 권한이 없습니다.');

    let correctCount = 0;

    for (const ans of answers) {
      const item = exam.items.find((i) => i.id === ans.examItemId);
      if (!item) continue;

      item.userAnswer = ans.answer;
      item.isCorrect = item.question.correctAnswer === ans.answer;
      if (item.isCorrect) correctCount++;

      await this.examItemRepo.save(item);
    }

    const totalScore = Math.round((correctCount / exam.items.length) * 100);
    exam.totalScore = totalScore;
    await this.examRepo.save(exam);

    try {
      const incorrectItems = exam.items.filter(
        (item) => item.isCorrect === false,
      );
      for (const item of incorrectItems) {
        const { targetConcept, unitId, subjectId } = item.question;
        const existing = await this.incorrectRecordRepo.findOne({
          where: {
            userId,
            targetConcept,
            unitId,
            source: IncorrectSource.EXAM,
          },
        });
        if (existing) {
          existing.incorrectCount++;
          existing.consecutiveCorrect = 0;
          existing.lastIncorrectAt = new Date();
          existing.questionId = item.questionId;
          await this.incorrectRecordRepo.save(existing);
        } else {
          const record = this.incorrectRecordRepo.create({
            userId,
            questionId: item.questionId,
            subjectId,
            unitId,
            targetConcept,
            source: IncorrectSource.EXAM,
            incorrectCount: 1,
            consecutiveCorrect: 0,
            isGraduated: false,
            lastIncorrectAt: new Date(),
          });
          await this.incorrectRecordRepo.save(record);
        }
      }
    } catch {
      // silently continue — don't break grading
    }

    return {
      score: totalScore,
      correctCount,
      totalCount: exam.items.length,
    };
  }

  // ============================================================
  // 채점 결과 조회
  // ============================================================
  async getResult(userId: string, examId: string) {
    const exam = await this.examRepo.findOne({
      where: { id: examId },
      relations: ['subject', 'items', 'items.question'],
      order: { items: { orderIndex: 'ASC' } },
    });
    if (!exam) throw new NotFoundException('시험을 찾을 수 없습니다.');
    if (exam.userId !== userId)
      throw new ForbiddenException('접근 권한이 없습니다.');

    const items = exam.items.map((item) => ({
      id: item.id,
      orderIndex: item.orderIndex,
      userAnswer: item.userAnswer,
      isCorrect: item.isCorrect,
      question: {
        id: item.question.id,
        targetConcept: item.question.targetConcept,
        questionStem: item.question.questionStem,
        ...(() => {
          const { stimulusData, effectiveTemplate } =
            this.normalizer.normalizeStimulusWithTemplate(
              item.question.stimulusData,
              item.question.recommendedTemplate,
              item.question.comboBlock,
            );
          return { stimulusData, recommendedTemplate: effectiveTemplate };
        })(),
        optionsList: item.question.optionsList,
        comboBlock: item.question.comboBlock,
        correctAnswer: item.question.correctAnswer,
        explanation: item.question.explanation,
        setGroupId: item.question.setGroupId,
        setPosition: item.question.setPosition,
      },
    }));

    const correctCount = items.filter((i) => i.isCorrect).length;

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        difficulty: exam.difficulty,
        totalScore: exam.totalScore,
        createdAt: exam.createdAt,
        subject: exam.subject,
      },
      score: exam.totalScore ?? 0,
      correctCount,
      totalCount: items.length,
      items,
    };
  }

  private async runJob(
    userIdJobId: string,
    userId: string,
    dto: CreateExamDto,
  ) {
    this.examGenerationJobsService.start(userIdJobId, userId);
    const deadline =
      dto.sourceType === 'ai'
        ? undefined
        : new ReferenceJobDeadline({
            deadlineAtMs: Date.now() + REFERENCE_JOB_TIMEOUT_MS,
          });

    const exam = await this.createWithProgress(
      userId,
      dto,
      (update) =>
        this.examGenerationJobsService.push(userIdJobId, userId, update),
      deadline,
    );

    this.examGenerationJobsService.complete(userIdJobId, userId, exam.id);

    const subjectSlug = exam.subject?.slug ?? '';
    try {
      await this.notificationsService.createAndPushNotification(
        userId,
        NotificationType.EXAM_COMPLETE,
        '시험 생성 완료',
        `${exam.title} 시험이 생성되었습니다. 지금 바로 풀어보세요!`,
        `/exam/${subjectSlug}`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `[EXAM-JOB] ${userIdJobId} notification failed`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async createReferenceFrameExam(
    userId: string,
    dto: CreateExamDto,
    subjectTitle: string,
    subjectSlug: string,
    reportProgress?: ExamGenerationProgressReporter,
    deadline?: ReferenceJobDeadline,
  ) {
    const drafts = await this.referenceFrameGenerationService.generate(
      subjectSlug,
      dto.startUnitNum,
      dto.endUnitNum,
      dto.difficulty,
      dto.questionCount,
      dto.targetConcepts,
      dto.referenceSourceIds,
      {
        ...(deadline === undefined ? {} : { deadline }),
        ...(reportProgress === undefined ? {} : { reportProgress }),
      },
    );
    if (drafts.length !== dto.questionCount) {
      throw new InternalServerErrorException({
        code: 'REFERENCE_GENERATION_SHORTFALL',
        requestedCount: dto.questionCount,
        generatedCount: drafts.length,
        stageCounts: { source: 0, planner: 0, fidelity: 0 },
      });
    }

    const title = `${subjectTitle} ${dto.startUnitNum}~${dto.endUnitNum}단원 (${dto.difficulty})`;
    const exam = await this.examRepo.manager.transaction(async (manager) => {
      const questionRepo = manager.getRepository(Question);
      const unitRepo = manager.getRepository(Unit);
      const cacheMutations = drafts.flatMap((draft) =>
        draft.cacheMutation === undefined ? [] : [draft.cacheMutation],
      );
      const questions: Question[] = [];
      for (const draft of drafts) {
        const unitNumber =
          Number.parseInt(
            draft.result.metadata.unit_name.replace(/[^0-9]/g, ''),
            10,
          ) || dto.startUnitNum;
        let unit = await unitRepo.findOne({
          where: { subjectId: dto.subjectId, unitNumber },
        });
        if (unit === null) {
          unit = await unitRepo.save(
            unitRepo.create({
              subjectId: dto.subjectId,
              unitNumber,
              title: draft.result.metadata.unit_name,
            }),
          );
        }
        questions.push(
          await questionRepo.save(
            questionRepo.create({
              subjectId: dto.subjectId,
              unitId: unit.id,
              targetConcept: draft.result.metadata.target_concept,
              itemType: draft.result.metadata.item_type,
              difficulty: draft.result.metadata.difficulty,
              recommendedTemplate: draft.result.metadata.recommended_template,
              questionStem: draft.result.render_ready.question_stem,
              stimulusData: draft.result.render_ready.stimulus_data,
              optionsList: [...draft.result.render_ready.options_list],
              comboBlock:
                draft.result.render_ready.combo_block === null
                  ? null
                  : {
                      title: draft.result.render_ready.combo_block.title,
                      items: [...draft.result.render_ready.combo_block.items],
                    },
              explanation: draft.result.explanation,
              correctAnswer: draft.result.correct_answer,
              setGroupId: null,
              setPosition: null,
              generationLineage: draft.lineage,
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
          sourceType: ExamSourceType.REFERENCE,
        }),
      );
      if (cacheMutations.length > 0) {
        const frameCacheRepo = manager.getRepository(ReferenceFrameCache);
        for (const cacheMutation of cacheMutations) {
          await frameCacheRepo.save(cacheMutation);
        }
      }
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
    await reportProgress?.({
      stage: 'saving',
      progress: 100,
      status: 'success',
      message: '참조 프레임 문항 저장 완료',
    });
    return this.findOne(userId, exam.id);
  }

  private async createSimplyReferenceExam(
    userId: string,
    dto: CreateExamDto,
    subjectTitle: string,
    subjectSlug: string,
    reportProgress?: ExamGenerationProgressReporter,
    deadline?: ReferenceJobDeadline,
  ) {
    const history =
      dto.excludePrevious === false
        ? undefined
        : await this.getSimplyReferenceHistory(
            userId,
            dto.subjectId,
            dto.startUnitNum,
            dto.endUnitNum,
          );
    const drafts = await this.simplyReferenceGenerationService.generate(
      subjectSlug,
      dto.startUnitNum,
      dto.endUnitNum,
      dto.difficulty,
      dto.questionCount,
      dto.targetConcepts,
      dto.referenceSourceIds,
      reportProgress,
      deadline,
      dto.customPrompt,
      {
        excludePrevious: dto.excludePrevious,
        generationNonce: randomUUID(),
        previousFingerprints: history?.fingerprints,
        previousSourceIds: history?.sourceIds,
      },
    );
    if (drafts.length !== dto.questionCount) {
      throw new InternalServerErrorException({
        code: 'REFERENCE_GENERATION_SHORTFALL',
        requestedCount: dto.questionCount,
        generatedCount: drafts.length,
        stageCounts: { source: 0, planner: 0, fidelity: 0 },
      });
    }

    const title = `${subjectTitle} ${dto.startUnitNum}~${dto.endUnitNum}단원 (${dto.difficulty})`;
    const exam = await this.examRepo.manager.transaction(async (manager) => {
      const questionRepo = manager.getRepository(Question);
      const unitRepo = manager.getRepository(Unit);
      const questions: Question[] = [];
      for (const draft of drafts) {
        const unitNumber =
          Number.parseInt(
            draft.result.metadata.unit_name.replace(/[^0-9]/g, ''),
            10,
          ) || dto.startUnitNum;
        let unit = await unitRepo.findOne({
          where: { subjectId: dto.subjectId, unitNumber },
        });
        if (unit === null) {
          unit = await unitRepo.save(
            unitRepo.create({
              subjectId: dto.subjectId,
              unitNumber,
              title: draft.result.metadata.unit_name,
            }),
          );
        }
        questions.push(
          await questionRepo.save(
            questionRepo.create({
              subjectId: dto.subjectId,
              unitId: unit.id,
              targetConcept: draft.result.metadata.target_concept,
              itemType: draft.result.metadata.item_type,
              difficulty: draft.result.metadata.difficulty,
              recommendedTemplate: draft.result.metadata.recommended_template,
              variantGroupId: `${dto.subjectId}:${unit.id}:${draft.result.metadata.target_concept}:${draft.result.metadata.recommended_template}`,
              questionStem: draft.result.render_ready.question_stem,
              stimulusData: draft.result.render_ready.stimulus_data,
              optionsList: [...draft.result.render_ready.options_list],
              comboBlock:
                draft.result.render_ready.combo_block === null
                  ? null
                  : {
                      title: draft.result.render_ready.combo_block.title,
                      items: [...draft.result.render_ready.combo_block.items],
                    },
              explanation: draft.result.explanation,
              correctAnswer: draft.result.correct_answer,
              setGroupId: null,
              setPosition: null,
              generationLineage: draft.lineage,
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
          sourceType: ExamSourceType.REFERENCE,
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
    await reportProgress?.({
      stage: 'saving',
      progress: 100,
      status: 'success',
      message: '참조 문항을 저장했습니다.',
      completed: drafts.length,
      total: dto.questionCount,
      attempt: 1,
      maxAttempts: 1,
    });
    return this.findOne(userId, exam.id);
  }

  private async getSimplyReferenceHistory(
    userId: string,
    subjectId: string,
    startUnitNum: number,
    endUnitNum: number,
  ): Promise<
    Readonly<{ fingerprints: readonly string[]; sourceIds: readonly string[] }>
  > {
    const exams = await this.examRepo.find({
      where: { userId, subjectId, startUnitNum, endUnitNum },
    });
    if (exams.length === 0) return { fingerprints: [], sourceIds: [] };

    const items = await this.examItemRepo.find({
      where: { examId: In(exams.map((exam) => exam.id)) },
      relations: ['question'],
    });
    const fingerprints = new Set<string>();
    const sourceIds = new Set<string>();
    for (const item of items) {
      const question = item.question;
      if (question?.itemType !== 'simply_reference') continue;
      const lineage = question.generationLineage;
      fingerprints.add(
        simplyReferenceFingerprint({
          questionStem: question.questionStem,
          stimulusData: question.stimulusData as Record<string, unknown>,
          optionsList: question.optionsList,
          comboBlock: question.comboBlock,
        }),
      );
      if (
        lineage?.generationPath === 'simply_reference' &&
        lineage.source.sourceId.length > 0
      ) {
        sourceIds.add(lineage.source.sourceId);
      }
    }
    return { fingerprints: [...fingerprints], sourceIds: [...sourceIds] };
  }

  private async createWithProgress(
    userId: string,
    dto: CreateExamDto,
    reportProgress?: ExamGenerationProgressReporter,
    deadline?: ReferenceJobDeadline,
  ) {
    const subject = await this.subjectRepo.findOne({
      where: { id: dto.subjectId },
    });
    if (!subject) throw new NotFoundException('과목을 찾을 수 없습니다.');

    if (dto.sourceType === 'simply_reference') {
      return this.createSimplyReferenceExam(
        userId,
        dto,
        subject.title,
        subject.slug,
        reportProgress,
        deadline,
      );
    }

    if (dto.sourceType !== 'ai') {
      return this.createReferenceFrameExam(
        userId,
        dto,
        subject.title,
        subject.slug,
        reportProgress,
        deadline,
      );
    }

    const questions = await this.examGeneratorService.generate(
      dto.subjectId,
      subject.slug,
      dto.startUnitNum,
      dto.endUnitNum,
      dto.difficulty,
      dto.questionCount,
      dto.customPrompt,
      dto.targetConcepts,
      reportProgress,
      userId,
      dto.excludePrevious,
    );

    const title = `${subject.title} ${dto.startUnitNum}~${dto.endUnitNum}단원 (${dto.difficulty})`;
    const exam = await this.examRepo.manager.transaction(async (manager) => {
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
          sourceType: ExamSourceType.AI,
        }),
      );
      const items = questions.map((q, idx) =>
        this.examItemRepo.create({
          examId: savedExam.id,
          questionId: q.id,
          orderIndex: idx + 1,
        }),
      );
      await manager.save(items);
      return savedExam;
    });

    return this.findOne(userId, exam.id);
  }

  async flagItem(
    userId: string,
    examId: string,
    itemId: string,
    reason?: string,
  ) {
    try {
      const examItem = await this.examItemRepo.findOne({
        where: { id: itemId, examId },
        relations: ['exam', 'question'],
      });
      if (!examItem) throw new NotFoundException('문항을 찾을 수 없습니다.');
      if (examItem.exam.userId !== userId)
        throw new ForbiddenException('권한이 없습니다.');

      // 문항 스냅샷 저장 (차후 발전에 사용)
      await this.flaggedQuestionRepo.save(
        this.flaggedQuestionRepo.create({
          questionId: examItem.questionId,
          userId,
          reason: reason ?? '',
          questionSnapshot: {
            targetConcept: examItem.question.targetConcept,
            recommendedTemplate: examItem.question.recommendedTemplate,
            questionStem: examItem.question.questionStem,
            stimulusData: examItem.question.stimulusData,
            optionsList: examItem.question.optionsList,
            comboBlock: examItem.question.comboBlock,
            explanation: examItem.question.explanation,
            correctAnswer: examItem.question.correctAnswer,
            difficulty: examItem.question.difficulty,
          },
        }),
      );

      // 시험에서 문항 제거
      await this.examItemRepo.delete({ id: itemId, examId });

      this.logger.log(
        `문항 플래그: userId=${userId} examId=${examId} itemId=${itemId} reason=${reason}`,
      );

      return { message: '문항이 플래그되었습니다.' };
    } catch (error) {
      this.logger.error(
        `문항 플래그 실패: userId=${userId} examId=${examId} itemId=${itemId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
