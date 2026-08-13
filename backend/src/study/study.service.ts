import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { TextbookEmbeddingService } from '../textbook/textbook-embedding.service';
import { StudyProgress } from '../entities/study-progress.entity';
import { Unit } from '../entities/unit.entity';
import { Subject } from '../entities/subject.entity';
import { User } from '../entities/user.entity';
import { IncorrectRecord } from '../entities/incorrect-record.entity';
import { Question } from '../entities/question.entity';
import { ExamItem } from '../entities/exam-item.entity';
import { ConceptBookmark } from '../entities/concept-bookmark.entity';
import { UnitExamProfile } from '../entities/unit-exam-profile.entity';
import { Difficulty } from '../entities/exam-record.entity';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { SubmitReviewResultDto } from './dto/submit-review-result.dto';
import { CreateIncorrectRecordsDto } from './dto/create-incorrect-records.dto';
import { ReviewGenerateDto } from './dto/review-generate.dto';
import {
  StudyQuizGeneratorService,
  QuizCount,
  CacheType,
} from './study-quiz-generator.service';
import { ExamsService } from '../exams/exams.service';
import { StimulusNormalizer } from '../exams/stimulus-normalizer';
import { IsOptional, IsString, IsArray, IsIn, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import type { BlankQuestion, ConceptPair } from '../textbook/textbook.service';
import { SupabaseService } from '../supabase/supabase.service';
import { getUnit1ConceptDefinition } from './unit1-concept-definition';
import { AiUnitProfileService } from '../exams/ai-unit-profile.service';
import type { StudyInsights, StudyMustKnowBlock } from './study-insights';

export class DeleteCacheBulkDto {
  @IsOptional()
  @IsString()
  subjectSlug?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  unitNumbers?: number[];

  @IsOptional()
  @IsArray()
  @IsIn(['blank', 'concept'], { each: true })
  types?: ('blank' | 'concept')[];
}

export class RegenerateCacheDto {
  @IsString()
  subjectSlug: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  unitNumbers?: number[];

  @IsOptional()
  @IsArray()
  @IsIn(['blank', 'concept'], { each: true })
  types?: ('blank' | 'concept')[];

  @IsOptional()
  @IsIn([10, 20])
  @Type(() => Number)
  count?: 10 | 20;
}

export interface RegenerationProgress {
  status: 'idle' | 'running' | 'completed';
  completed: number;
  total: number;
  errors: string[];
}

@Injectable()
export class StudyService {
  private readonly logger = new Logger(StudyService.name);
  private readonly normalizer = new StimulusNormalizer();

  private readonly SUBJECT_MAP: Record<string, string> = {
    success: 'sungjik',
    industry: 'kongil',
  };

  private readonly SUBJECT_TITLE_MAP: Record<string, string> = {
    success: '성공적인 직업생활',
    industry: '산업 일반',
  };

  private regenerationProgress: RegenerationProgress = {
    status: 'idle',
    completed: 0,
    total: 0,
    errors: [],
  };

  constructor(
    @InjectRepository(StudyProgress)
    private readonly progressRepo: Repository<StudyProgress>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly supabase: SupabaseService,
    private readonly dataSource: DataSource,
    @InjectRepository(IncorrectRecord)
    private readonly incorrectRecordRepo: Repository<IncorrectRecord>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(ExamItem)
    private readonly examItemRepo: Repository<ExamItem>,
    @InjectRepository(ConceptBookmark)
    private readonly conceptBookmarkRepo: Repository<ConceptBookmark>,
    private readonly quizGenerator: StudyQuizGeneratorService,
    private readonly examsService: ExamsService,
    private readonly embeddingService: TextbookEmbeddingService,
    @Optional()
    @InjectRepository(UnitExamProfile)
    private readonly unitExamProfileRepo?: Repository<UnitExamProfile>,
    @Optional()
    private readonly aiUnitProfileService?: AiUnitProfileService,
  ) {}

  async getProgressBySubject(userId: string, subjectSlug: string) {
    const subject = await this.subjectRepo.findOne({
      where: { slug: subjectSlug },
    });
    if (!subject) {
      throw new NotFoundException(`과목을 찾을 수 없습니다: ${subjectSlug}`);
    }

    const units = await this.unitRepo.find({
      where: { subjectId: subject.id },
      order: { unitNumber: 'ASC' },
    });

    const progressList = await this.progressRepo.find({
      where: { userId },
      relations: ['unit'],
    });

    const subjectProgressList = progressList.filter(
      (p) => p.unit.subjectId === subject.id,
    );

    return {
      subject: { id: subject.id, slug: subject.slug, title: subject.title },
      totalUnits: units.length,
      progress: subjectProgressList,
    };
  }

  async getUnitsWithProgress(userId: string, subjectSlug: string) {
    const subject = await this.subjectRepo.findOne({
      where: { slug: subjectSlug },
    });
    if (!subject) {
      throw new NotFoundException(`과목을 찾을 수 없습니다: ${subjectSlug}`);
    }

    const units = await this.unitRepo.find({
      where: { subjectId: subject.id },
      order: { unitNumber: 'ASC' },
    });

    const progressList = await this.progressRepo.find({
      where: { userId },
      relations: ['unit'],
    });

    const progressByUnit = new Map<string, StudyProgress[]>();
    for (const p of progressList) {
      if (p.unit.subjectId !== subject.id) continue;
      if (!progressByUnit.has(p.unitId)) {
        progressByUnit.set(p.unitId, []);
      }
      progressByUnit.get(p.unitId)!.push(p);
    }

    const studyModeLabels: Record<string, string> = {
      BASIC_CONCEPT: '기본 개념',
      BLANK_FILL: '빈칸 채우기',
      INTERACTIVE_QUIZ: '인터랙티브 퀴즈',
      PRACTICE_EXAM: '연습 시험',
      REVIEW_INCORRECT: '오답 복습',
    };

    const TOTAL_STUDY_MODES = 5; // BASIC_CONCEPT, BLANK_FILL, INTERACTIVE_QUIZ, PRACTICE_EXAM, REVIEW_INCORRECT

    const result = units.map((unit) => {
      const unitProgress = progressByUnit.get(unit.id) ?? [];
      const avgProgress =
        unitProgress.length > 0
          ? Math.round(
              unitProgress.reduce((sum, p) => sum + p.progressPercent, 0) /
                TOTAL_STUDY_MODES,
            )
          : 0;

      return {
        id: unit.id,
        unitNumber: unit.unitNumber,
        title: unit.title,
        progress: avgProgress,
        subUnits: Object.keys(studyModeLabels).map((studyMode) => {
          const progress = unitProgress.find((p) => p.studyMode === studyMode);
          const progressPercent = progress?.progressPercent ?? 0;
          return {
            studyMode,
            title: studyModeLabels[studyMode],
            progressPercent,
            status:
              progressPercent === 100
                ? 'completed'
                : progressPercent > 0
                  ? 'in_progress'
                  : 'not_started',
            lastStudiedAt: progress?.lastStudiedAt,
          };
        }),
      };
    });

    return { units: result };
  }

  async updateProgress(userId: string, dto: UpdateProgressDto) {
    const unit = await this.unitRepo.findOne({ where: { id: dto.unitId } });
    if (!unit) {
      throw new NotFoundException(`단원을 찾을 수 없습니다: ${dto.unitId}`);
    }

    let progress = await this.progressRepo.findOne({
      where: { userId, unitId: dto.unitId, studyMode: dto.studyMode },
    });

    if (progress) {
      progress.progressPercent = dto.progressPercent;
      // @UpdateDateColumn이 자동으로 lastStudiedAt을 갱신함
      progress = await this.progressRepo.save(progress);
    } else {
      progress = this.progressRepo.create({
        userId,
        unitId: dto.unitId,
        studyMode: dto.studyMode,
        progressPercent: dto.progressPercent,
      });
      progress = await this.progressRepo.save(progress);
    }

    await this.updateStreak(userId);

    return { progress };
  }

  async getStreak(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`사용자를 찾을 수 없습니다: ${userId}`);
    }
    return { studyStreakDays: user.studyStreakDays };
  }

  private async updateStreak(userId: string) {
    const progressList = await this.progressRepo.find({
      where: { userId },
      select: ['lastStudiedAt'],
      order: { lastStudiedAt: 'DESC' },
    });

    // 날짜별로 학습 여부를 Set으로 관리 (YYYY-MM-DD 형식)
    const studiedDates = new Set(
      progressList.map((p) => this.toDateString(p.lastStudiedAt)),
    );

    const today = this.toDateString(new Date());
    let streak = 0;
    let current = new Date();

    // 오늘 학습 기록이 없으면 스트릭 0
    if (!studiedDates.has(today)) {
      await this.userRepo.update(userId, { studyStreakDays: 0 });
      return;
    }

    // 오늘부터 역순으로 연속 날짜 카운트
    while (studiedDates.has(this.toDateString(current))) {
      streak++;
      current = new Date(current);
      current.setDate(current.getDate() - 1);
    }

    await this.userRepo.update(userId, { studyStreakDays: streak });
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  async getConceptMd(subjectSlug: string, unitNumber: number): Promise<{ md: string }> {
    const md = await this.quizGenerator.getSummationMd(subjectSlug, unitNumber);
    return { md };
  }

  async getSummationCards(subjectSlug: string, unitNumber: number): Promise<any> {
    const md = await this.quizGenerator.getSummationMd(subjectSlug, unitNumber);
    const jsonMatch = md.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch) {
      throw new NotFoundException(
        `${subjectSlug} ${unitNumber}단원 summation JSON을 파싱할 수 없습니다.`,
      );
    }
    return JSON.parse(jsonMatch[1]);
  }

  async getSummationV2Cards(subjectSlug: string, unitNumber: number): Promise<any> {
    const subject = this.SUBJECT_MAP[subjectSlug];
    if (!subject) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }

    const { data: unit } = await this.supabase.client
      .from('textbook_units')
      .select('id')
      .eq('subject', subject)
      .eq('unit_number', unitNumber)
      .single();

    if (!unit) {
      return this.getSummationCards(subjectSlug, unitNumber);
    }

    const { data: cards } = await this.supabase.client
      .from('textbook_summation_cards')
      .select('title, body, key_concepts')
      .eq('unit_id', unit.id)
      .order('card_index');

    if (!cards?.length) {
      return this.getSummationCards(subjectSlug, unitNumber);
    }

    return { unit: unitNumber, cards: cards.map((c: any) => ({ content: c })) };
  }

  async updateSummationCards(
    subjectSlug: string,
    unitNumber: number,
    cards: any[],
  ): Promise<any> {
    const subject = this.SUBJECT_MAP[subjectSlug];
    if (!subject) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }

    const { data: unit } = await this.supabase.client
      .from('textbook_units')
      .select('id')
      .eq('subject', subject)
      .eq('unit_number', unitNumber)
      .single();

    if (!unit) {
      throw new NotFoundException(
        `${subjectSlug} 과목의 ${unitNumber}단원을 찾을 수 없습니다.`,
      );
    }

    // 기존 카드 삭제 후 재삽입
    await this.supabase.client
      .from('textbook_summation_cards')
      .delete()
      .eq('unit_id', unit.id);

    for (let i = 0; i < cards.length; i++) {
      await this.supabase.client
        .from('textbook_summation_cards')
        .insert({
          unit_id: unit.id,
          card_index: i,
          title: cards[i].content?.title ?? null,
          body: cards[i].content?.body ?? null,
          key_concepts: cards[i].content?.key_concepts ?? null,
        });
    }

    const data = {
      subject: this.SUBJECT_TITLE_MAP[subjectSlug] ?? subjectSlug,
      totalCards: cards.length,
      cards,
    };

    await this.quizGenerator.clearCache(subjectSlug, unitNumber);
    await this.embeddingService.embedUnit(subjectSlug, unitNumber);

    return data;
  }

  async getConceptByName(
    subjectSlug: string,
    unitNumber: number,
    targetConcept: string,
  ): Promise<{
    title: string;
    description: string;
    bulletPoints: string[];
    trapPoints: string[];
    logicFlow: string;
  } | null> {
    const rawMd = await this.quizGenerator.getSummationMd(subjectSlug, unitNumber);

    const jsonMatch = rawMd.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch) return null;

    try {
      const data = JSON.parse(jsonMatch[1]);
      const cards = data.cards ?? [];

      const card = cards.find((c: any) => {
        const content = c.content;
        if (!content) return false;
        const title = content.title ?? '';
        const description = content.description ?? '';
        const table = content.integrated_data?.table ?? '';
        const logicFlow = content.integrated_data?.logic_flow ?? '';
        const bulletPoints = (content.bullet_points ?? []).join(' ');
        const trapPoints = (content.trap_points ?? []).join(' ');
        const tags = (content.tags ?? []).join(' ');
        const searchable = `${title} ${description} ${table} ${logicFlow} ${bulletPoints} ${trapPoints} ${tags}`;

        return (
          title === targetConcept ||
          title.includes(targetConcept) ||
          targetConcept.includes(title) ||
          searchable.includes(targetConcept)
        );
      });

      if (!card) return null;

      return {
        title: card.content.title,
        description: card.content.description ?? '',
        bulletPoints: card.content.bullet_points ?? [],
        trapPoints: card.content.trap_points ?? [],
        logicFlow: card.content.integrated_data?.logic_flow ?? '',
      };
    } catch {
      return null;
    }
  }

  getBlankQuestions(
    subjectSlug: string,
    unitNumber: number,
    count: QuizCount,
  ): Promise<{ items: BlankQuestion[] }> {
    return this.quizGenerator
      .generateBlankQuestions(subjectSlug, unitNumber, count)
      .then((items) => ({ items }));
  }

  getConceptPairs(
    subjectSlug: string,
    unitNumber: number,
    count: QuizCount,
  ): Promise<{ items: ConceptPair[] }> {
    return this.quizGenerator
      .generateConceptPairs(subjectSlug, unitNumber, count)
      .then((items) => ({ items }));
  }

  clearCache(
    subjectSlug: string,
    unitNumber: number,
    type?: CacheType,
    count?: QuizCount,
  ): void {
    this.quizGenerator.clearCache(subjectSlug, unitNumber, type, count);
  }

  async submitReviewResult(userId: string, dto: SubmitReviewResultDto) {
    let updated = 0;
    let graduated = 0;

    for (const item of dto.results) {
      const record = await this.incorrectRecordRepo.findOne({
        where: {
          userId,
          targetConcept: item.targetConcept,
          unitId: item.unitId,
          source: item.source,
        },
      });

      if (!record) continue;

      if (item.isCorrect) {
        record.consecutiveCorrect++;
        if (record.consecutiveCorrect >= 3) {
          record.isGraduated = true;
          graduated++;
        }
      } else {
        record.consecutiveCorrect = 0;
        record.incorrectCount++;
        record.lastIncorrectAt = new Date();
      }

      record.lastReviewedAt = new Date();
      await this.incorrectRecordRepo.save(record);
      updated++;
    }

    return { updated, graduated };
  }

  async getReviewRecommendations(userId: string) {
    const records = await this.incorrectRecordRepo.find({
      where: { userId, isGraduated: false },
      relations: ['unit', 'subject'],
    });

    const now = new Date();

    const scored = records.map((r) => {
      let timeSinceLastReviewBonus = 5;
      if (r.lastReviewedAt) {
        const diffDays = Math.floor(
          (now.getTime() - r.lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (diffDays >= 7) timeSinceLastReviewBonus = 5;
        else if (diffDays >= 3) timeSinceLastReviewBonus = 3;
        else if (diffDays >= 1) timeSinceLastReviewBonus = 1;
        else timeSinceLastReviewBonus = 0;
      }

      const score = r.incorrectCount * 2 + timeSinceLastReviewBonus;

      const daysSinceLastReview = r.lastReviewedAt
        ? Math.floor(
            (now.getTime() - r.lastReviewedAt.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null;

      return { record: r, score, daysSinceLastReview };
    });

    scored.sort((a, b) => b.score - a.score);

    const grouped = new Map<
      string,
      {
        record: IncorrectRecord;
        score: number;
        daysSinceLastReview: number | null;
        questionIds: string[];
      }
    >();

    for (const item of scored) {
      const key = `${item.record.unitId}:${item.record.subject.slug}:${item.record.targetConcept}`;
      const existing = grouped.get(key);
      if (existing) {
        if (item.record.questionId)
          existing.questionIds.push(item.record.questionId);
        if (item.score > existing.score) {
          existing.score = item.score;
          existing.daysSinceLastReview = item.daysSinceLastReview;
        }
      } else {
        grouped.set(key, {
          record: item.record,
          score: item.score,
          daysSinceLastReview: item.daysSinceLastReview,
          questionIds: item.record.questionId ? [item.record.questionId] : [],
        });
      }
    }

    const sortedGroups = [...grouped.values()].sort(
      (a, b) => b.score - a.score,
    );
    const top = sortedGroups.slice(0, 20);

    const recommendations = top.map((g) => ({
      targetConcept: g.record.targetConcept,
      subjectSlug: g.record.subject.slug,
      subjectTitle: g.record.subject.title,
      unitNumber: g.record.unit.unitNumber,
      unitTitle: g.record.unit.title,
      incorrectCount: g.record.incorrectCount,
      daysSinceLastReview: g.daysSinceLastReview,
      source: g.record.source,
      score: g.score,
      questionIds: g.questionIds,
    }));

    return {
      totalIncorrectConcepts: grouped.size,
      recommendations,
    };
  }

  private async assertReviewQuestionAccess(
    userId: string,
    questionIds: string[],
  ) {
    const requestedIds = [...new Set(questionIds)];
    const records = await this.incorrectRecordRepo.find({
      where: requestedIds.map((questionId) => ({
        userId,
        questionId,
        isGraduated: false,
      })),
    });
    const ownedQuestionIds = new Set(
      records.map((record) => record.questionId).filter((id): id is string => !!id),
    );

    if (ownedQuestionIds.size !== requestedIds.length) {
      throw new NotFoundException('복습할 수 없는 문제입니다.');
    }

    // Incorrect records are user-writable, so they are not sufficient proof that
    // the user was actually shown and answered a question.
    const answeredItems = await this.examItemRepo.find({
      where: requestedIds.map((questionId) => ({
        questionId,
        userAnswer: Not(IsNull()),
        exam: { userId },
      })),
    });
    const answeredQuestionIds = new Set(
      answeredItems.map((item) => item.questionId),
    );
    if (answeredQuestionIds.size !== requestedIds.length) {
      throw new NotFoundException('복습할 수 없는 문제입니다.');
    }
  }

  async getReviewQuestions(userId: string, questionIds: string[]) {
    const requestedIds = [...new Set(questionIds)];
    await this.assertReviewQuestionAccess(userId, requestedIds);

    const questions = await this.questionRepo.find({
      where: requestedIds.map((id) => ({ id })),
    });
    const questionsById = new Map(questions.map((question) => [question.id, question]));
    if (questionsById.size !== requestedIds.length) {
      throw new NotFoundException('문제를 찾을 수 없습니다.');
    }

    return requestedIds.map((questionId) => {
      const q = questionsById.get(questionId)!;
      return {
        id: q.id,
        metadata: {
          unit_name: '',
          target_concept: q.targetConcept,
          item_type: q.itemType,
          difficulty: q.difficulty,
          recommended_template: q.recommendedTemplate,
        },
        render_ready: {
          question_stem: q.questionStem,
          stimulus_data: q.stimulusData,
          options_list: q.optionsList,
        },
      };
    });
  }

  async submitReviewAnswer(userId: string, questionId: string, answer: number) {
    await this.assertReviewQuestionAccess(userId, [questionId]);

    const question = await this.questionRepo.findOne({ where: { id: questionId } });
    if (!question) {
      throw new NotFoundException('문제를 찾을 수 없습니다.');
    }

    return {
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      isCorrect: answer === question.correctAnswer,
    };
  }

  async saveIncorrectRecords(userId: string, dto: CreateIncorrectRecordsDto) {
    let saved = 0;

    for (const record of dto.records) {
      const subject = await this.subjectRepo.findOne({
        where: { slug: record.subjectSlug },
      });
      if (!subject) {
        throw new NotFoundException(
          `과목을 찾을 수 없습니다: ${record.subjectSlug}`,
        );
      }

      const unit = await this.unitRepo.findOne({
        where: { subjectId: subject.id, unitNumber: record.unitNumber },
      });
      if (!unit) {
        throw new NotFoundException(
          `단원을 찾을 수 없습니다: ${record.subjectSlug} ${record.unitNumber}`,
        );
      }

      if (record.questionId) {
        const question = await this.questionRepo.findOne({
          where: {
            id: record.questionId,
            subjectId: subject.id,
            unitId: unit.id,
            targetConcept: record.targetConcept,
          },
        });
        const answeredExamItem = await this.examItemRepo.findOne({
          where: {
            questionId: record.questionId,
            userAnswer: Not(IsNull()),
            exam: { userId },
          },
        });
        if (!question || !answeredExamItem) {
          throw new ForbiddenException('풀이한 문제만 오답으로 기록할 수 있습니다.');
        }
      }

      const existing = await this.incorrectRecordRepo.findOne({
        where: {
          userId,
          targetConcept: record.targetConcept,
          unitId: unit.id,
          source: record.source,
        },
      });

      if (existing) {
        existing.incorrectCount++;
        existing.consecutiveCorrect = 0;
        existing.lastIncorrectAt = new Date();
        await this.incorrectRecordRepo.save(existing);
      } else {
        const newRecord = this.incorrectRecordRepo.create({
          userId,
          subjectId: subject.id,
          unitId: unit.id,
          targetConcept: record.targetConcept,
          source: record.source,
          questionId: record.questionId ?? null,
          incorrectCount: 1,
          consecutiveCorrect: 0,
          isGraduated: false,
          lastIncorrectAt: new Date(),
        });
        await this.incorrectRecordRepo.save(newRecord);
      }

      saved++;
    }

    return { saved };
  }

  async createReviewExamJob(userId: string, dto: ReviewGenerateDto) {
    const subject = await this.subjectRepo.findOne({
      where: { slug: dto.subjectSlug },
    });
    if (!subject)
      throw new NotFoundException(
        `과목을 찾을 수 없습니다: ${dto.subjectSlug}`,
      );

    const records = await this.incorrectRecordRepo.find({
      where: { userId, subjectId: subject.id, isGraduated: false },
      relations: ['unit'],
    });

    if (records.length === 0) {
      throw new NotFoundException('복습할 오답이 없습니다.');
    }

    const targetConcepts = [...new Set(records.map((r) => r.targetConcept))];

    const unitNumbers = records.map((r) => r.unit.unitNumber);
    const startUnitNum = dto.unitRange?.start ?? Math.min(...unitNumbers);
    const endUnitNum = dto.unitRange?.end ?? Math.max(...unitNumbers);

    return this.examsService.createJob(userId, {
      subjectId: subject.id,
      startUnitNum,
      endUnitNum,
      difficulty: (dto.difficulty as Difficulty) ?? Difficulty.MIDDLE,
      questionCount: dto.questionCount ?? 10,
      targetConcepts,
      customPrompt:
        '사용자가 자주 틀리는 개념 위주로 문제를 생성해주세요: ' +
        targetConcepts.join(', '),
    });
  }

  // ============================================================
  // Cache Management (admin)
  // ============================================================

  private getTextbookBase(): string {
    return (
      process.env.TEXTBOOK_BASE_PATH ??
      path.resolve(__dirname, '..', '..', '..', 'textbook')
    );
  }

  private readOfflineConceptCards(subjectSlug: string): any[] | null {
    const directory = path.join(this.getTextbookBase(), '_v2', 'rebuild', subjectSlug);
    for (const name of ['all-concept-tags-offline.json', 'concept-tags-offline.json']) {
      const file = path.join(directory, name);
      if (!fs.existsSync(file)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Array.isArray(data)) return data;
      } catch {
        return null;
      }
    }
    return null;
  }

  private async getAvailableUnits(subject: string): Promise<number[]> {
    const { data } = await this.supabase.client
      .from('textbook_units')
      .select('unit_number')
      .eq('subject', subject)
      .order('unit_number');
    return (data ?? []).map((u: any) => u.unit_number);
  }

  async getCacheStatus() {
    const entries = Object.entries(this.SUBJECT_MAP);
    const result: Array<{ slug: string; title: string; units: any[] }> = [];

    for (const [slug, subject] of entries) {
      const { data: cacheRows } = await this.supabase.client
        .from('quiz_cache')
        .select('unit_number, cache_type, quiz_count, data')
        .eq('subject', subject);

      const availableUnits = await await this.getAvailableUnits(subject);
      const units = availableUnits.map((unitNumber) => {
        const entry: any = { unitNumber, blank10: null, blank20: null, concept10: null, concept20: null };
        const rows = (cacheRows ?? []).filter((r: any) => r.unit_number === unitNumber);
        for (const row of rows) {
          const key = `${row.cache_type}${row.quiz_count}`;
          entry[key] = Array.isArray(row.data) ? row.data.length : null;
        }
        return entry;
      });

      result.push({ slug, title: this.SUBJECT_TITLE_MAP[slug] ?? slug, units });
    }

    return { subjects: result };
  }

    async deleteCacheBulk(dto: DeleteCacheBulkDto): Promise<{ deleted: number }> {
    let deleted = 0;
    const slugs = dto.subjectSlug
      ? [dto.subjectSlug]
      : Object.keys(this.SUBJECT_MAP);

    for (const slug of slugs) {
      const subject = this.SUBJECT_MAP[slug];
      if (!subject) continue;

      let query = this.supabase.client
        .from('quiz_cache')
        .delete()
        .eq('subject', subject);

      if (dto.unitNumbers?.length) query = query.in('unit_number', dto.unitNumbers);
      if (dto.types?.length) query = query.in('cache_type', dto.types);

      const { error, count } = await query.select('id');
      if (!error && count) deleted += count;
    }

    return { deleted };
  }

  async regenerateCache(dto: RegenerateCacheDto): Promise<{ status: string; total: number }> {
    const folder = this.SUBJECT_MAP[dto.subjectSlug];
    if (!folder) return { status: 'error', total: 0 };

    const unitNumbers = dto.unitNumbers ?? await this.getAvailableUnits(folder);
    const types: CacheType[] = dto.types ?? ['blank', 'concept'];
    const count: QuizCount = dto.count ?? 10;
    const total = unitNumbers.length * types.length;

    this.regenerationProgress = {
      status: 'running',
      completed: 0,
      total,
      errors: [],
    };

    void this.doRegenerate(dto.subjectSlug, unitNumbers, types, count).catch(
      (err) => {
        this.logger.error('Regeneration failed', err);
      },
    );

    return { status: 'started', total };
  }

  getRegenerationStatus(): RegenerationProgress {
    return { ...this.regenerationProgress };
  }

  private async doRegenerate(
    subjectSlug: string,
    unitNumbers: number[],
    types: CacheType[],
    count: QuizCount,
  ) {
    for (const unitNumber of unitNumbers) {
      for (const type of types) {
        try {
          // 먼저 기존 캐시를 삭제한 후 재생성
          await this.quizGenerator.clearCache(subjectSlug, unitNumber, type, count);
          if (type === 'blank') {
            await this.quizGenerator.generateBlankQuestions(
              subjectSlug,
              unitNumber,
              count,
            );
          } else {
            await this.quizGenerator.generateConceptPairs(
              subjectSlug,
              unitNumber,
              count,
            );
          }
        } catch (err: any) {
          this.regenerationProgress.errors.push(
            `${subjectSlug}/${unitNumber}/${type}: ${err.message ?? err}`,
          );
        }
        this.regenerationProgress.completed++;
      }
    }
    this.regenerationProgress.status = 'completed';
  }

  async getConceptBookmarks(userId: string) {
    return this.conceptBookmarkRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async addConceptBookmark(
    userId: string,
    data: {
      subjectSlug: string;
      unitNumber: number;
      conceptName: string;
      description?: string;
    },
  ) {
    const existing = await this.conceptBookmarkRepo.findOne({
      where: {
        userId,
        subjectSlug: data.subjectSlug,
        unitNumber: data.unitNumber,
        conceptName: data.conceptName,
      },
    });
    if (existing) return existing;

    const bookmark = this.conceptBookmarkRepo.create({
      userId,
      subjectSlug: data.subjectSlug,
      unitNumber: data.unitNumber,
      conceptName: data.conceptName,
      description: data.description ?? null,
    });
    return this.conceptBookmarkRepo.save(bookmark);
  }

  async removeConceptBookmark(userId: string, bookmarkId: string) {
    const bookmark = await this.conceptBookmarkRepo.findOne({
      where: { id: bookmarkId, userId },
    });
    if (!bookmark) throw new NotFoundException('북마크를 찾을 수 없습니다.');
    await this.conceptBookmarkRepo.remove(bookmark);
    return { message: '삭제되었습니다.' };
  }

  async getFrequencyConcept(subjectSlug: string, unitNumber: number): Promise<any> {
    const subject = this.SUBJECT_MAP[subjectSlug];
    if (!subject) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }

    if (process.env.DB_PROVIDER === 'local') {
      const units = (await this.dataSource.query(
        `SELECT id FROM textbook_units
         WHERE subject = $1 AND unit_number = $2`,
        [subject, unitNumber],
      )) as Array<{ id: string }>;
      const unit = units[0];

      if (!unit) {
        return this.emptyFrequencyConcept(subjectSlug, unitNumber);
      }

       const representativeTags = await this.getRepresentativeTags(unit.id);
       const structuredConcept = this.readStructuredConceptSafely(subjectSlug, unitNumber);

      const offlineCards = process.env.STUDY_USE_OFFLINE_CONCEPT_TAGS === 'true'
        ? this.readOfflineConceptCards(subjectSlug)
          ?.filter((card) => card._offline?.unitNumber === unitNumber)
        : null;
       const effectiveTags = offlineCards?.length
         ? offlineCards.map((card, index) => ({ name: card.name, sortOrder: index }))
         : representativeTags;
       const cards = offlineCards ?? ((await this.dataSource.query(
        `SELECT rank, name, frequency, sources, definition, key_points,
                textbook_excerpt, enriched_definition, caution, quiz,
                real_question AS "realQuestion"
         FROM textbook_concept_cards
         WHERE unit_id = $1
         ORDER BY rank NULLS LAST, name`,
        [unit.id],
      )) as any[]);

      if (cards.length >= 5) {
        return this.withStudyInsights(
          subjectSlug,
          unitNumber,
          this.alignFrequencyConcepts(
            this.transformCardsToFrequency({ concepts: cards }),
             effectiveTags,
            structuredConcept,
          ),
        );
      }

      const frequencies = (await this.dataSource.query(
        `SELECT frequency_data FROM textbook_frequencies WHERE unit_id = $1`,
        [unit.id],
      )) as Array<{ frequency_data: any }>;
      if (frequencies[0]) {
        return this.withStudyInsights(
          subjectSlug,
          unitNumber,
          this.alignFrequencyConcepts(
            this.normalizeFrequencyConcepts(frequencies[0].frequency_data),
             effectiveTags,
            structuredConcept,
          ),
        );
      }

      return this.withStudyInsights(
        subjectSlug,
        unitNumber,
        this.alignFrequencyConcepts(
          { concepts: [] },
           effectiveTags,
          structuredConcept,
        ),
      );
    }

    // concept_cards 먼저 시도
    const { data: unit } = await this.supabase.client
      .from('textbook_units')
      .select('id')
      .eq('subject', subject)
      .eq('unit_number', unitNumber)
      .single();

    if (unit) {
      const representativeTags = await this.getRepresentativeTags(unit.id);
      const structuredConcept = this.readStructuredConceptSafely(subjectSlug, unitNumber);
      const offlineCards = process.env.STUDY_USE_OFFLINE_CONCEPT_TAGS === 'true'
        ? this.readOfflineConceptCards(subjectSlug)?.filter((card) => card._offline?.unitNumber === unitNumber)
        : null;
      if (offlineCards?.length) {
        return this.withStudyInsights(
          subjectSlug,
          unitNumber,
          this.transformCardsToFrequency({ concepts: offlineCards }),
        );
      }
      const { data: cards } = await this.supabase.client
        .from('textbook_concept_cards')
        .select('*')
        .eq('unit_id', unit.id)
        .order('rank');

      if (cards && cards.length >= 5) {
        return this.withStudyInsights(
          subjectSlug,
          unitNumber,
          this.alignFrequencyConcepts(
            this.transformCardsToFrequency({ concepts: cards }),
            representativeTags,
            structuredConcept,
          ),
        );
      }

      // frequency 테이블 fallback
      const { data: freq } = await this.supabase.client
        .from('textbook_frequencies')
        .select('frequency_data')
        .eq('unit_id', unit.id)
        .single();

       if (freq) {
          return this.withStudyInsights(
            subjectSlug,
            unitNumber,
            this.alignFrequencyConcepts(
              this.normalizeFrequencyConcepts(freq.frequency_data),
              representativeTags,
              structuredConcept,
            ),
          );
       }

    }

    // 데이터 없으면 빈 배열 반환 (500 대신)
    return this.withStudyInsights(
      subjectSlug,
      unitNumber,
      this.emptyFrequencyConcept(subjectSlug, unitNumber),
    );
  }

  private async getRepresentativeTags(
    unitId: string,
  ): Promise<Array<{ name: string; sortOrder: number }>> {
    if (process.env.DB_PROVIDER === 'local') {
      const rows = (await this.dataSource.query(
        `SELECT concept_name, sort_order
         FROM textbook_concepts
         WHERE unit_id = $1
         ORDER BY sort_order, concept_name`,
        [unitId],
      )) as Array<{ concept_name: string; sort_order: number }>;
      return rows.map((row) => ({
        name: row.concept_name,
        sortOrder: row.sort_order,
      }));
    }

    const { data, error } = await this.supabase.client
      .from('textbook_concepts')
      .select('concept_name, sort_order')
      .eq('unit_id', unitId)
      .order('sort_order');
    if (error || !data) {
      this.logger.warn(`Representative Study tags unavailable for unit ${unitId}`);
      return [];
    }
    return data.map((row) => ({
      name: row.concept_name,
      sortOrder: row.sort_order,
    }));
  }

  private alignFrequencyConcepts(
    data: Record<string, any>,
    representativeTags: Array<{ name: string; sortOrder: number }>,
    structuredConcept?: any,
  ): Record<string, any> {
    if (!representativeTags.length || !Array.isArray(data.concepts)) return data;

    const concepts = data.concepts as Array<Record<string, any>>;
    const assignments = new Map<string, Array<Record<string, any>>>();
    for (const concept of concepts) {
      const candidates = representativeTags
        .map((tag) => ({ tag, score: this.representativeTagScore(tag.name, concept.name) }))
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score);
      const match = candidates[0];
      if (!match || candidates.some((candidate) => candidate.score === match.score && candidate !== match)) {
        continue;
      }
      const group = assignments.get(match.tag.name) ?? [];
      group.push(concept);
      assignments.set(match.tag.name, group);
    }

    const aligned = representativeTags.map((tag, index) => {
      const group = assignments.get(tag.name) ?? [];
      if (group.length === 0) {
        return this.buildStructuredConcept(tag.name, index + 1, structuredConcept);
      }
      return this.mergeRepresentativeConcept(tag.name, index + 1, group);
    });

    // ponytail: representative tags are the product contract; legacy-only cards stay out of the study sequence.
    return {
      ...data,
      concepts: aligned,
    };
  }

  private representativeTagScore(tagName: unknown, conceptName: unknown): number {
    const tag = this.normalizeConceptName(tagName);
    const concept = this.normalizeConceptName(conceptName);
    if (!tag || !concept) return 0;
    if (tag === concept) return 100;
    if (concept.startsWith(tag)) return 80;
    if (tag.startsWith(concept)) return 70;
    const tagTokens = this.conceptTokens(tagName);
    const conceptTokens = this.conceptTokens(conceptName);
    const shared = tagTokens.filter((token) =>
      conceptTokens.some(
        (candidate) =>
          !this.isGenericConceptToken(token) &&
          !this.isGenericConceptToken(candidate) &&
          (token.includes(candidate) || candidate.includes(token)),
      ),
    );
    if (shared.length >= 2 || (shared.length === 1 && shared[0].length >= 4)) {
      return 40 + shared.length;
    }
    return 0;
  }

  private normalizeConceptName(value: unknown): string {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[\s·()（）\-_/]+/gu, '')
      .trim();
  }

  private conceptTokens(value: unknown): string[] {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[()（）/·,，:：]+/gu, ' ')
      .split(/\s+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
  }

  private isGenericConceptToken(token: string): boolean {
    return new Set(['직업', '생활', '의미', '중요성', '유형', '방식', '근무', '다양성']).has(token);
  }

  private readStructuredConceptSafely(subjectSlug: string, unitNumber: number): any | undefined {
    try {
      return this.getStructuredConcept(subjectSlug, unitNumber);
    } catch {
      return undefined;
    }
  }

  private buildStructuredConcept(
    tagName: string,
    rank: number,
    structuredConcept: any,
  ): Record<string, any> {
    const candidates = (structuredConcept?.sections ?? []).flatMap((section: any) =>
      (section.subsections ?? []).map((subsection: any) => ({ section, subsection })),
    );
    const match = candidates
      .map(({ section, subsection }: any) => ({
        section,
        subsection,
        score: this.representativeTagScore(
          tagName,
          `${section.title} ${subsection.title} ${subsection.explanation ?? ''}`,
        ),
      }))
      .sort((left: any, right: any) => right.score - left.score)[0];

    if (!match || match.score === 0) {
      return {
        name: tagName,
        rank,
        frequency: 0,
        sources: [],
        questionFormats: [],
        description: '',
        keyPoints: [],
        examTips: [],
        conceptContent: '',
        subtopics: [],
        sampleQuestion: null,
        relatedQuestions: [],
        sourceTag: tagName,
        contentStatus: 'missing',
      };
    }

    const { section, subsection } = match;
    const keyPoints = Array.isArray(subsection.keyPoints) ? subsection.keyPoints : [];
    const examTips = Array.isArray(subsection.examPoints) ? subsection.examPoints : [];
    const pitfalls = Array.isArray(subsection.pitfalls) ? subsection.pitfalls : [];
    const parts = [
      `## 개념 정의\n${subsection.explanation || section.summary || ''}`,
      keyPoints.length ? `## 핵심 포인트\n${keyPoints.map((point: string) => `- ${point}`).join('\n')}` : '',
      subsection.table ? `## 비교·정리\n${subsection.table}` : '',
      examTips.length ? `## 시험 출제 포인트\n${examTips.map((point: string) => `- ${point}`).join('\n')}` : '',
      pitfalls.length ? `## 오답 주의\n${pitfalls.map((point: string) => `- ${point}`).join('\n')}` : '',
    ].filter(Boolean);

    return {
      name: tagName,
      rank,
      frequency: 0,
      sources: [],
      questionFormats: [],
      description: subsection.explanation || section.summary || '',
      keyPoints,
      examTips,
      conceptContent: parts.join('\n\n'),
      subtopics: [{ name: subsection.title }],
      sampleQuestion: null,
      relatedQuestions: [],
      sourceTag: tagName,
      contentStatus: 'complete',
    };
  }

  private mergeRepresentativeConcept(
    tagName: string,
    rank: number,
    concepts: Array<Record<string, any>>,
  ): Record<string, any> {
    const primary = [...concepts].sort(
      (left, right) => Number(right.frequency ?? 0) - Number(left.frequency ?? 0),
    )[0];
    const uniqueStrings = (values: unknown[]) => [
      ...new Set(values.filter((value): value is string => typeof value === 'string' && !!value.trim())),
    ];
    const subtopics = uniqueStrings(concepts.map((concept) => concept.name))
      .filter((name) => name !== tagName)
      .map((name) => ({ name }));

    return {
      ...primary,
      name: tagName,
      rank,
      frequency: Math.max(...concepts.map((concept) => Number(concept.frequency ?? 0)), 0),
      sources: uniqueStrings(concepts.flatMap((concept) => concept.sources ?? [])),
      questionFormats: uniqueStrings(concepts.flatMap((concept) => concept.questionFormats ?? [])),
      keyPoints: uniqueStrings(concepts.flatMap((concept) => concept.keyPoints ?? [])).slice(0, 5),
      examTips: uniqueStrings(concepts.flatMap((concept) => concept.examTips ?? [])).slice(0, 5),
      subtopics,
      relatedQuestions: concepts.flatMap((concept) => concept.relatedQuestions ?? []).slice(0, 5),
      sourceTag: tagName,
      contentStatus: 'complete',
    };
  }

  async getStudyExamPatterns(subjectSlug: string, unitNumber: number) {
    const subject = this.SUBJECT_MAP[subjectSlug];
    if (!subject) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }
    return {
      subjectSlug,
      unitNumber,
      ...(await this.readStudyInsights(subjectSlug, unitNumber)),
    };
  }

  private async withStudyInsights(
    subjectSlug: string,
    unitNumber: number,
    data: Record<string, unknown>,
  ) {
    const enrichedData = await this.withRelatedQuestions(data);
    const studyInsights = await this.readStudyInsights(subjectSlug, unitNumber);
    const withMustKnow = this.withStudyMustKnow(enrichedData, studyInsights);
    return studyInsights.patterns.length > 0 || (studyInsights.mustKnowBlocks?.length ?? 0) > 0
      ? { ...withMustKnow, studyInsights }
      : withMustKnow;
  }

  private withStudyMustKnow(
    data: Record<string, unknown>,
    studyInsights: Pick<StudyInsights, 'mustKnowBlocks'>,
  ) {
    if (!Array.isArray(data.concepts)) return data;
    const blocks = studyInsights.mustKnowBlocks ?? [];
    const concepts = data.concepts.map((concept: any) => {
      const block = blocks.find((candidate) =>
        candidate.conceptAliases.some((alias) =>
          concept.name?.includes(alias) || alias.includes(concept.name ?? ''),
        ),
      );
      if (block !== undefined) return { ...concept, examMustKnow: block };
      const keyPoints = Array.isArray(concept.keyPoints) ? concept.keyPoints : [];
      const importantNumbers = Array.isArray(concept.importantNumbers)
        ? concept.importantNumbers.filter((value: unknown) => value !== null && value !== undefined).map(String)
        : [];
      const comparisonTable = typeof concept.comparisonTable === 'string'
        ? concept.comparisonTable.trim()
        : '';
      if (keyPoints.length === 0 && importantNumbers.length === 0 && comparisonTable === '') return concept;
      const fallback: StudyMustKnowBlock = {
        id: `card-${slugForMustKnow(concept.name)}`,
        conceptAliases: [concept.name],
        title: '핵심 암기',
        type: comparisonTable === '' ? 'checklist' : 'comparison',
        ...(comparisonTable === '' ? {} : { summary: comparisonTable }),
        mustRemember: [
          ...keyPoints,
          ...importantNumbers.map((value) => `중요 수치: ${value}`),
        ].slice(0, 5),
        commonTraps: concept.caution ? [concept.caution] : [],
        referenceQuestionIds: [],
        confidence: 'related',
        reviewStatus: 'textbook_only',
      };
      return { ...concept, examMustKnow: fallback };
    });
    return { ...data, concepts };
  }

  private async withRelatedQuestions(data: Record<string, unknown>) {
    if (process.env.DB_PROVIDER === 'local') return data;
    const concepts = Array.isArray(data.concepts) ? data.concepts : [];
    const names = concepts
      .map((concept: any) => concept?.name)
      .filter((name): name is string => typeof name === 'string' && name.trim() !== '');
    if (names.length === 0) return data;

    try {
      const related = await this.findSimilarByConceptNames(names, names.length * 5);
      const enrichedConcepts = concepts.map((concept: any) => {
        // ponytail: cards_moi가 이미 채운 relatedQuestions(conceptHighlightV2 보유)는 보존하고,
        // reference_questions는 중복 제거 후 뒤에 추가한다. sampleQuestion도 지우지 않는다.
        const existing = Array.isArray(concept.relatedQuestions) ? concept.relatedQuestions : [];
        const keyOf = (question: any) =>
          question.questionSource && question.questionNumber != null
            ? `${question.questionSource}:${question.questionNumber}`
            : question.id ?? JSON.stringify(question.question);
        const seen = new Set<string>(existing.map(keyOf));
        const matches = related.filter((question: any) =>
          question.matchedConcepts?.some(
            (name: string) => name.includes(concept.name) || concept.name.includes(name),
          ),
        );
        const refQuestions = matches
          .filter((question: any) => {
            const key = keyOf(question);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, Math.max(0, 5 - existing.length));
        const merged = [...existing, ...refQuestions];
        if (merged.length > 0) {
          return {
            ...concept,
            relatedQuestions: merged,
            sampleQuestion: concept.sampleQuestion ?? merged[0].question,
          };
        }
        return { ...concept, relatedQuestions: [], sampleQuestion: concept.sampleQuestion ?? null };
      });
      return { ...data, concepts: enrichedConcepts };
    } catch (error) {
      this.logger.warn(
        `Related Study questions unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return data;
    }
  }

  private async readStudyInsights(subjectSlug: string, unitNumber: number) {
    if (process.env.DB_PROVIDER === 'local') {
      return {
        version: 'v2' as const,
        sourceQuestionCount: 0,
        verifiedQuestionCount: 0,
        patterns: [],
        mustKnowBlocks: [],
      };
    }
    const profile = this.unitExamProfileRepo?.findOne
      ? await this.unitExamProfileRepo.findOne({
          where: { subjectSlug, unitNumber },
        })
      : null;
    const studyInsights = profile?.profile?.studyInsights;
    if (!isStudyInsights(studyInsights)) {
      if (this.aiUnitProfileService) {
        const generated = await this.aiUnitProfileService.getProfile(
          subjectSlug,
          unitNumber,
          unitNumber,
        );
        const generatedInsights = generated.units[0]?.studyInsights;
        if (generatedInsights !== undefined) return normalizeStudyInsights(generatedInsights);
      }
      return {
        version: 'v2' as const,
        sourceQuestionCount: 0,
        verifiedQuestionCount: 0,
        patterns: [],
        mustKnowBlocks: [],
      };
    }
    return normalizeStudyInsights(studyInsights);
  }

  private emptyFrequencyConcept(subjectSlug: string, unitNumber: number) {
    this.logger.warn(`No frequency concept data for ${subjectSlug}/${unitNumber}`);
    return { concepts: [] };
  }

  private normalizeFrequencyConcepts(frequencyData: any): any {
    if (!Array.isArray(frequencyData?.concepts)) return frequencyData;

    return {
      ...frequencyData,
      concepts: frequencyData.concepts.map((concept: any) => ({
        ...concept,
        description:
          this.extractDefinition(concept.conceptContent) ?? concept.description,
      })),
    };
  }

  private extractDefinition(conceptContent: unknown): string | null {
    if (typeof conceptContent !== 'string') return null;
    const match = conceptContent.match(
      /^##\s*개념 정의\s*\n+([\s\S]*?)(?=^##\s|$)/m,
    );
    return match?.[1].trim() || null;
  }

  private normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item): item is string => typeof item === 'string',
          );
        }
      } catch {
        return value.trim() ? [value] : [];
      }
    }
    return [];
  }

  async getMindmap(subjectSlug: string, unitNumber: number): Promise<any> {
    const subject = this.SUBJECT_MAP[subjectSlug];
    if (!subject) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }

    const { data: unit } = await this.supabase.client
      .from('textbook_units')
      .select('id')
      .eq('subject', subject)
      .eq('unit_number', unitNumber)
      .single();

    if (!unit) {
      throw new NotFoundException(
        `${subjectSlug} 과목의 ${unitNumber}단원을 찾을 수 없습니다.`,
      );
    }

    const { data: mindmap } = await this.supabase.client
      .from('textbook_mindmaps')
      .select('mindmap_data')
      .eq('unit_id', unit.id)
      .single();

    if (!mindmap) {
      throw new NotFoundException(
        `${subjectSlug} 과목의 ${unitNumber}단원 마인드맵을 찾을 수 없습니다.`,
      );
    }

    return mindmap.mindmap_data;
  }

  private buildRelatedQuestion(realQ: any, raw: any, conceptName: string): any | null {
    if (!realQ) return null;

    return {
      id: realQ.id || null,
      questionSource: realQ.questionSource || realQ.source_exam || '',
      questionNumber: realQ.number || realQ.metadata?.question_number || null,
      correct_answer: this.parseCorrectAnswer(
        realQ.correct_answer ?? realQ.answer,
      ),
      rawStimulus: realQ.stimulus ?? '',
      conceptHighlightV2: realQ.conceptHighlightV2 || null,
      question: {
        metadata: realQ.metadata || {
          source_exam: realQ.source_exam || '',
          question_number: realQ.number || 0,
          unit_name: raw.unitTitle || '',
          target_concept: conceptName,
          item_type: '실전 모의고사',
          recommended_template:
            realQ.metadata?.recommended_template ?? undefined,
        },
        render_ready: {
          question_stem: this.stripQuestionNumber(
            realQ.render_ready?.question_stem || realQ.stem || '',
          ),
          stimulus_data:
            this.normalizeRealStimulus(
              realQ.render_ready?.stimulus_data,
              realQ.metadata?.recommended_template,
            ) ?? (realQ.stimulus ? { content: realQ.stimulus } : null),
          options_list:
            realQ.render_ready?.options_list || realQ.options || [],
          explanation: realQ.render_ready?.explanation || '',
        },
        combo_block:
          realQ.combo_block ||
          (realQ.box_items && realQ.box_items.length > 0
            ? {
                title: '<보기>',
                items: realQ.box_items.map((text: string, i: number) => ({
                  key: ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'][i] || `${i + 1}`,
                  text,
                })),
              }
            : null),
      },
    };
  }

  private transformCardsToFrequency(raw: any): any {
    const concepts = (raw.concepts || []).map((c: any) => {
      // TypeORM aliases this as realQuestion; Supabase returns the DB column name.
      const realQuestion = c.realQuestion ?? c.real_question;
      const realQ = realQuestion?.questionData;
      const textbookExcerpt = c.textbook_excerpt ?? c.card?.textbookExcerpt ?? '';
      const definition = c.definition ?? c.card?.definition ?? '';
      const keyPoints = this.normalizeStringArray(
        c.key_points ?? c.card?.keyPoints,
      );
      const importantNumbers = Array.isArray(
        c.important_numbers ?? c.importantNumbers ?? c.card?.importantNumbers,
      )
        ? (c.important_numbers ?? c.importantNumbers ?? c.card?.importantNumbers)
            .filter((value: unknown) => value !== null && value !== undefined)
            .map(String)
        : [];
      const comparisonTable = String(
        c.comparison_table ?? c.comparisonTable ?? c.card?.comparisonTable ?? '',
      ).trim();
      const description =
        c.enriched_definition ?? c.card?.enrichedDefinition ?? definition;
      const caution = c.caution || '';
      const conceptUsage = realQuestion?.conceptUsage || '';
      const conceptSubtopics = Array.isArray(realQuestion?.conceptSubtopics)
        ? realQuestion.conceptSubtopics
        : [];
      const conceptExamPatterns = Array.isArray(realQuestion?.conceptExamPatterns)
        ? realQuestion.conceptExamPatterns
        : [];
      const storedConceptContent =
        typeof realQuestion?.conceptContent === 'string'
          ? realQuestion.conceptContent
          : '';

      const conceptContentParts: string[] = [];
      if (definition) conceptContentParts.push(`## 개념 정의\n${definition}`);
      if (textbookExcerpt)
        conceptContentParts.push(`## 교과서 원문\n${textbookExcerpt}`);
      if (keyPoints.length)
        conceptContentParts.push(
          `## 핵심 포인트\n${keyPoints.map((p: string) => `- ${p}`).join('\n')}`,
        );
      if (caution) conceptContentParts.push(`## ⚠️ 오답 주의\n${caution}`);
      if (conceptUsage)
        conceptContentParts.push(`## 실제 출제 포인트\n${conceptUsage}`);

      const guideSteps: any[] = [
        { type: 'intro', message: `${c.name}에 대해 알아보아요.` },
        { type: 'definition', title: c.name, content: definition },
      ];
      if (keyPoints.length) {
        guideSteps.push({
          type: 'keypoints',
          title: '핵심 포인트',
          items: keyPoints,
        });
      }
      if (caution) {
        guideSteps.push({
          type: 'exampoint',
          title: '오답 주의',
          points: [caution],
          tips: conceptUsage ? [conceptUsage] : [],
        });
      }
      if (c.quiz?.length) {
        for (const q of c.quiz) {
          guideSteps.push({
            type: 'quiz',
            question: q.question,
            options: q.options,
            correctIndex: q.answer,
            explanation: q.explanation,
          });
        }
      }
      guideSteps.push({
        type: 'guide',
        message: `${c.name}에 대해 잘 이해하셨나요? 다음으로 넘어가요!`,
      });

      return {
        rank: c.rank,
        name: c.name,
        frequency: c.frequency,
        sources: c.sources || [],
        questionFormats: this.normalizeStringArray(
          c.question_formats ??
            c.questionFormats ??
            realQuestion?.questionFormats ??
            realQuestion?.question_formats,
        ),
        description,
        contentStatus: c._offline?.status === 'needs_review'
          ? 'needs_review'
          : c._offline?.status === 'textbook_only'
            ? 'textbook_only'
            : 'complete',
        conceptDefinition:
          realQuestion?.conceptDefinition ?? getUnit1ConceptDefinition(c.name),
        keyPoints,
         examTips: conceptExamPatterns.length > 0
           ? conceptExamPatterns
           : caution
             ? [caution]
             : [],
         conceptContent: storedConceptContent || conceptContentParts.join('\n\n'),
          importantNumbers,
          comparisonTable,
         subtopics: conceptSubtopics,
        sampleQuestion: realQ
          ? {
              metadata: realQ.metadata || {
                source_exam: realQ.source_exam || '',
                question_number: realQ.number || 0,
                unit_name: raw.unitTitle || '',
                target_concept: c.name,
                item_type: '실전 모의고사',
                recommended_template:
                  realQ.metadata?.recommended_template ?? undefined,
              },
              render_ready: {
                question_stem: this.stripQuestionNumber(
                  realQ.render_ready?.question_stem || realQ.stem || '',
                ),
                stimulus_data:
                  this.normalizeRealStimulus(
                    realQ.render_ready?.stimulus_data,
                    realQ.metadata?.recommended_template,
                  ) ?? (realQ.stimulus ? { content: realQ.stimulus } : null),
                options_list:
                  realQ.render_ready?.options_list || realQ.options || [],
                explanation: realQ.render_ready?.explanation || '',
              },
              combo_block:
                realQ.combo_block ||
                (realQ.box_items && realQ.box_items.length > 0
                  ? {
                      title: '<보기>',
                      items: realQ.box_items.map((text: string, i: number) => ({
                        key: ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'][i] || `${i + 1}`,
                        text,
                      })),
                    }
                  : null),
              correct_answer: this.parseCorrectAnswer(
                realQ.correct_answer ?? realQ.answer,
              ),
              questionNumber:
                realQ.number || realQ.metadata?.question_number || null,
              questionSource: realQ.questionSource || realQ.source_exam || '',
              rawStimulus: realQ.stimulus ?? '',
            }
          : c.quiz?.[0]
            ? {
                metadata: {
                  unit_name: raw.unitTitle || '',
                  target_concept: c.name,
                  item_type: '학습 확인 퀴즈',
                },
                render_ready: {
                  question_stem: c.quiz[0].question || '',
                  stimulus_data: null,
                  options_list: c.quiz[0].options || [],
                  explanation: c.quiz[0].explanation || '',
                },
                combo_block: null,
                correct_answer: (c.quiz[0].answer ?? 0) + 1,
                questionSource: `${c.name} 확인 퀴즈`,
              }
            : null,
        guideSteps,
        questionHighlights: [],
        questionExplanation: caution,
        clueAnalysis: conceptUsage
          ? {
              clueSteps: [
                {
                  targetText: conceptUsage,
                  location: '문제',
                  explanation: conceptUsage,
                  conceptLink: c.name,
                },
              ],
              conclusion: caution,
              markedStimulus: '',
            }
          : undefined,
        conceptHighlight: realQuestion?.conceptHighlight || {
          inStimulus: [],
          inOptions: [],
          reason: '',
        },
        conceptHighlightV2: realQuestion?.conceptHighlightV2 || null,
         relatedQuestions: realQ
           ? [this.buildRelatedQuestion(realQ, raw, c.name)].filter(Boolean)
           : [],
      };
    });

    return {
      subject: raw.subject,
      subjectSlug: raw.subjectSlug,
      unit: raw.unit,
      unitTitle: raw.unitTitle || '',
      totalQuestionsAnalyzed: concepts.length,
      concepts,
    };
  }

  /**
   * "⑤" → 5, "②" → 2, "3" → 3, 5 → 5 등 다양한 정답 형식을 숫자로 변환
   */
  private parseCorrectAnswer(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const circledMap: Record<string, number> = {
        '①': 1,
        '②': 2,
        '③': 3,
        '④': 4,
        '⑤': 5,
      };
      if (circledMap[value]) return circledMap[value];
      const num = parseInt(value.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(num) && num >= 1 && num <= 5) return num;
    }
    return 1;
  }

  private stripQuestionNumber(stem: string): string {
    return stem.replace(/^\d+\.\s*/, '');
  }

  private normalizeRealStimulus(stimulus: any, template?: string): any {
    if (!stimulus || typeof stimulus !== 'object') return stimulus;
    // participant_id → p_id 변환 (기존 호환성)
    if ('participants' in stimulus && 'messages' in stimulus) {
      const messages = (stimulus.messages as any[]).map((msg) => {
        if ('participant_id' in msg && !('p_id' in msg)) {
          return { ...msg, p_id: msg.participant_id };
        }
        return msg;
      });
      stimulus = { ...stimulus, messages };
    }
    // StimulusNormalizer로 추가 보정 (canvas_content.type, instructor.id 등)
    if (template) {
      return this.normalizer.normalizeStimulusData(stimulus, template);
    }
    return stimulus;
  }

  getStructuredConcept(subjectSlug: string, unitNumber: number): any {
    const folder = this.SUBJECT_MAP[subjectSlug];
    if (!folder) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }
    const filePath = path.join(
      this.getTextbookBase(),
      `${folder}_structured`,
      `${unitNumber}단원.json`,
    );
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(
        `${subjectSlug} 과목의 ${unitNumber}단원 structured concept 파일을 찾을 수 없습니다.`,
      );
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  // ============================================================
  // 이미지 문제 검색: source_exam + number로 기존 문제 매칭
  // ============================================================
  findQuestionBySourceAndNumber(
    sourceExam: string | null,
    number: number | null,
  ): any {
    if (!sourceExam || !number) return null;
    const folders = ['success_cards_moi', 'kongil_cards_moi'];
    for (const folder of folders) {
      const base = path.join(this.getTextbookBase(), folder);
      if (!fs.existsSync(base)) continue;
      const files = fs
        .readdirSync(base)
        .filter((f) => /^\d+단원\.json$/.test(f));
      for (const file of files) {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(base, file), 'utf-8'));
          for (const concept of d.concepts ?? []) {
            const qd = concept.realQuestion?.questionData;
            if (!qd) continue;
            const qSourceExam: string = qd.source_exam ?? '';
            const qNumber: number = qd.number ?? 0;
            if (
              qNumber === number &&
              (qSourceExam === sourceExam ||
                qSourceExam.includes(sourceExam) ||
                sourceExam.includes(qSourceExam))
            ) {
              return {
                conceptName: concept.name,
                unitNumber: parseInt(file.replace('단원.json', ''), 10),
                questionData: qd,
                conceptHighlightV2:
                  concept.realQuestion?.conceptHighlightV2 ?? null,
              };
            }
          }
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  // ============================================================
  // 유사 문제 검색: 개념명 기준으로 cards_moi에서 검색
  // ============================================================
  async findSimilarByConceptNames(
    conceptNames: string[],
    limit = 5,
  ): Promise<any[]> {
    if (!conceptNames || conceptNames.length === 0) return [];
    const { data, error } = await this.supabase.client
      .from('reference_questions')
      .select('id, logical_source_id, subject, unit_number, source_payload')
      .limit(1000);
    if (error || !data) return [];

    const normalized = conceptNames.map((name) => name.trim()).filter(Boolean);
    return data
      .flatMap((row: any) => {
        const payload = row.source_payload ?? {};
        const targets = Array.isArray(payload.targetConcepts)
          ? payload.targetConcepts.filter((value: unknown): value is string => typeof value === 'string')
          : [];
        const matchedNames = normalized.filter((name) =>
          targets.some((target) => target.includes(name) || name.includes(target)),
        );
        if (matchedNames.length === 0 || !Array.isArray(payload.choices) || payload.choices.length !== 5) return [];
        const source = payload.source ?? {};
        const explanation = payload.explanation || payload.generatedExplanation || '';
        return [{
          id: row.logical_source_id ?? row.id ?? undefined,
          conceptName: targets[0] ?? matchedNames[0],
          matchedConcepts: matchedNames,
          unitNumber: row.unit_number,
          sourceExam: source.filename ?? '',
          questionNumber: payload.questionNumber ?? null,
          question: {
            metadata: {
              source_exam: source.filename ?? '',
              question_number: payload.questionNumber ?? 0,
              unit_name: `${row.unit_number}단원`,
              target_concept: targets[0] ?? matchedNames[0],
              item_type: '실제 기출문제',
            },
            render_ready: {
              question_stem: payload.stem ?? '',
              stimulus_data: payload.stimulus ? { content: payload.stimulus } : null,
              options_list: payload.choices,
              explanation,
            },
            combo_block: buildComboBlock(payload.viewItems),
            correct_answer: Number(payload.correctAnswer),
            rawStimulus: payload.stimulus ?? '',
          },
          conceptHighlightV2: null,
        }];
      })
      .slice(0, limit);
  }
}

function buildComboBlock(
  boxItems: string[] | undefined,
): { title: string; items: { key: string; text: string }[] } | null {
  if (!boxItems || boxItems.length === 0) return null;
  const markers = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'];
  return {
    title: '보기',
    items: boxItems.map((item, i) => ({
      key: markers[i] ?? `${i + 1}`,
      text: item,
    })),
  };
}

function parseAnswer(ans: string | number | undefined): number | null {
  if (ans === undefined || ans === null) return null;
  if (typeof ans === 'number') return ans;
  const trimmed = ans.trim();
  // Handle "①", "②" etc.
  const circled = trimmed.match(/[①-⑤]/);
  if (circled) return '①②③④⑤'.indexOf(circled[0]) + 1;
  // Handle plain number string
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= 5) return num;
  return null;
}

function isStudyInsights(value: unknown): value is StudyInsights {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.version === 'v1' || record.version === 'v2') &&
    typeof record.sourceQuestionCount === 'number' &&
    typeof record.verifiedQuestionCount === 'number' &&
    Array.isArray(record.patterns) &&
    (record.version === 'v1' || Array.isArray(record.mustKnowBlocks))
  );
}

function normalizeStudyInsights(studyInsights: StudyInsights): StudyInsights {
  const patterns = studyInsights.patterns
    .map((pattern) => {
      const referenceQuestionIds = [...new Set(pattern.referenceQuestionIds)];
      return { ...pattern, referenceQuestionIds, frequency: referenceQuestionIds.length };
    })
    .sort((left, right) =>
      right.frequency - left.frequency || left.title.localeCompare(right.title, 'ko'),
    );
  return { ...studyInsights, patterns };
}

function slugForMustKnow(value: unknown): string {
  return String(value ?? 'concept')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '') || 'concept';
}
