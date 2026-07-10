import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamRecord } from '../entities/exam-record.entity';
import { ExamItem } from '../entities/exam-item.entity';
import { Subject } from '../entities/subject.entity';
import {
  IncorrectRecord,
  IncorrectSource,
} from '../entities/incorrect-record.entity';
import { FlaggedQuestion } from '../entities/flagged-question.entity';
import { ExamGeneratorService } from './exam-generator.service';
import { StimulusNormalizer } from './stimulus-normalizer';
import { TextbookService } from '../textbook/textbook.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { ExamGenerationJobsService } from './exam-generation-jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../entities/notification.entity';
import type { ExamGenerationProgressReporter } from './exam-generation.utils';

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

  async getConceptsBySlug(
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

    // AI 문항 생성
    const questions = dto.sourceType === 'reference'
      ? await this.examGeneratorService.regenerate(
          dto.subjectId,
          subject.slug,
          dto.startUnitNum,
          dto.endUnitNum,
          dto.difficulty,
          dto.questionCount,
          dto.targetConcepts,
          undefined,
          dto.customPrompt,
          userId,
          dto.excludePrevious,
        )
      : await this.examGeneratorService.generate(
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

    // ExamRecord 생성
    const title = `${subject.title} ${dto.startUnitNum}~${dto.endUnitNum}단원 (${dto.difficulty})`;
    const exam = this.examRepo.create({
      userId,
      subjectId: dto.subjectId,
      title,
      startUnitNum: dto.startUnitNum,
      endUnitNum: dto.endUnitNum,
      difficulty: dto.difficulty,
      questionCount: questions.length,
      customPrompt: dto.customPrompt ?? null,
    });
    await this.examRepo.save(exam);

    // ExamItem 생성
    const items = questions.map((q, idx) =>
      this.examItemRepo.create({
        examId: exam.id,
        questionId: q.id,
        orderIndex: idx + 1,
      }),
    );
    await this.examItemRepo.save(items);

    return this.findOne(userId, exam.id);
  }

  async createJob(userId: string, dto: CreateExamDto) {
    const subject = await this.subjectRepo.findOne({
      where: { id: dto.subjectId },
    });
    if (!subject) throw new NotFoundException('과목을 찾을 수 없습니다.');

    const job = this.examGenerationJobsService.create(userId, dto);

    void this.runJob(job.id, userId, dto).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.examGenerationJobsService.fail(job.id, userId, message);
    });

    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      message: job.message,
    };
  }

  getJob(userId: string, jobId: string) {
    return this.examGenerationJobsService.getForUser(jobId, userId);
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
      relations: ['subject', 'tags', 'items', 'items.question', 'items.question.unit'],
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
          const { stimulusData, effectiveTemplate } = this.normalizer.normalizeStimulusWithTemplate(
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
          const { stimulusData, effectiveTemplate } = this.normalizer.normalizeStimulusWithTemplate(
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

    const exam = await this.createWithProgress(userId, dto, (update) =>
      this.examGenerationJobsService.push(userIdJobId, userId, update),
    );

    this.examGenerationJobsService.complete(userIdJobId, userId, exam.id);

    const subjectSlug = exam.subject?.slug ?? '';
    await this.notificationsService.createAndPushNotification(
      userId,
      NotificationType.EXAM_COMPLETE,
      '시험 생성 완료',
      `${exam.title} 시험이 생성되었습니다. 지금 바로 풀어보세요!`,
      `/exam/${subjectSlug}`,
    );
  }

  private async createWithProgress(
    userId: string,
    dto: CreateExamDto,
    reportProgress?: ExamGenerationProgressReporter,
  ) {
    const subject = await this.subjectRepo.findOne({
      where: { id: dto.subjectId },
    });
    if (!subject) throw new NotFoundException('과목을 찾을 수 없습니다.');

    const questions = dto.sourceType === 'reference'
      ? await this.examGeneratorService.regenerate(
          dto.subjectId,
          subject.slug,
          dto.startUnitNum,
          dto.endUnitNum,
          dto.difficulty,
          dto.questionCount,
          dto.targetConcepts,
          reportProgress,
          dto.customPrompt,
          userId,
          dto.excludePrevious,
        )
      : await this.examGeneratorService.generate(
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
    const exam = this.examRepo.create({
      userId,
      subjectId: dto.subjectId,
      title,
      startUnitNum: dto.startUnitNum,
      endUnitNum: dto.endUnitNum,
      difficulty: dto.difficulty,
      questionCount: questions.length,
      customPrompt: dto.customPrompt ?? null,
    });
    await this.examRepo.save(exam);

    const items = questions.map((q, idx) =>
      this.examItemRepo.create({
        examId: exam.id,
        questionId: q.id,
        orderIndex: idx + 1,
      }),
    );
    await this.examItemRepo.save(items);

    return this.findOne(userId, exam.id);
  }

  async flagItem(userId: string, examId: string, itemId: string, reason?: string) {
    try {
      const examItem = await this.examItemRepo.findOne({
        where: { id: itemId, examId },
        relations: ['exam', 'question'],
      });
      if (!examItem) throw new NotFoundException('문항을 찾을 수 없습니다.');
      if (examItem.exam.userId !== userId) throw new ForbiddenException('권한이 없습니다.');

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

      this.logger.log(`문항 플래그: userId=${userId} examId=${examId} itemId=${itemId} reason=${reason}`);

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
