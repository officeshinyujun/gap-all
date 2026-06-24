import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { TextbookEmbeddingService } from '../textbook/textbook-embedding.service';
import { StudyProgress } from '../entities/study-progress.entity';
import { Unit } from '../entities/unit.entity';
import { Subject } from '../entities/subject.entity';
import { User } from '../entities/user.entity';
import { IncorrectRecord } from '../entities/incorrect-record.entity';
import { Question } from '../entities/question.entity';
import { ConceptBookmark } from '../entities/concept-bookmark.entity';
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
import { IsOptional, IsString, IsArray, IsIn, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import type { BlankQuestion, ConceptPair } from '../textbook/textbook.service';

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

  private readonly SUBJECT_FOLDER_MAP: Record<string, string> = {
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
    @InjectRepository(IncorrectRecord)
    private readonly incorrectRecordRepo: Repository<IncorrectRecord>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(ConceptBookmark)
    private readonly conceptBookmarkRepo: Repository<ConceptBookmark>,
    private readonly quizGenerator: StudyQuizGeneratorService,
    private readonly examsService: ExamsService,
    private readonly embeddingService: TextbookEmbeddingService,
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
        subUnits: unitProgress.map((p) => ({
          studyMode: p.studyMode,
          title: studyModeLabels[p.studyMode] ?? p.studyMode,
          progressPercent: p.progressPercent,
          status:
            p.progressPercent === 100
              ? 'completed'
              : p.progressPercent > 0
                ? 'in_progress'
                : 'not_started',
          lastStudiedAt: p.lastStudiedAt,
        })),
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

  getConceptMd(subjectSlug: string, unitNumber: number): { md: string } {
    const md = this.quizGenerator.getSummationMd(subjectSlug, unitNumber);
    return { md };
  }

  getSummationCards(subjectSlug: string, unitNumber: number): any {
    const md = this.quizGenerator.getSummationMd(subjectSlug, unitNumber);
    const jsonMatch = md.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch) {
      throw new NotFoundException(
        `${subjectSlug} ${unitNumber}단원 summation JSON을 파싱할 수 없습니다.`,
      );
    }
    return JSON.parse(jsonMatch[1]);
  }

  getSummationV2Cards(subjectSlug: string, unitNumber: number): any {
    const folder = this.SUBJECT_FOLDER_MAP[subjectSlug];
    if (!folder) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }
    const v2Path = path.join(
      this.getTextbookBase(),
      `${folder}_summation_v2`,
      `${unitNumber}단원.json`,
    );
    if (fs.existsSync(v2Path)) {
      return JSON.parse(fs.readFileSync(v2Path, 'utf-8'));
    }
    return this.getSummationCards(subjectSlug, unitNumber);
  }

  async updateSummationCards(
    subjectSlug: string,
    unitNumber: number,
    cards: any[],
  ): Promise<any> {
    const folder = this.SUBJECT_FOLDER_MAP[subjectSlug];
    if (!folder) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }

    const filePath = path.join(
      this.getTextbookBase(),
      `${folder}_summation`,
      `${unitNumber}단원.md`,
    );

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(
        `${subjectSlug} 과목의 ${unitNumber}단원 summation 파일을 찾을 수 없습니다.`,
      );
    }

    const data = {
      subject: this.SUBJECT_TITLE_MAP[subjectSlug] ?? subjectSlug,
      totalCards: cards.length,
      cards,
    };

    const content = '```json\n' + JSON.stringify(data, null, 2) + '\n```';
    fs.writeFileSync(filePath, content, 'utf-8');

    this.quizGenerator.clearCache(subjectSlug, unitNumber);

    await this.embeddingService.embedUnit(subjectSlug, unitNumber);

    return data;
  }

  getConceptByName(
    subjectSlug: string,
    unitNumber: number,
    targetConcept: string,
  ): {
    title: string;
    description: string;
    bulletPoints: string[];
    trapPoints: string[];
    logicFlow: string;
  } | null {
    const rawMd = this.quizGenerator.getSummationMd(subjectSlug, unitNumber);

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

  async getQuestionsByIds(questionIds: string[]) {
    if (questionIds.length === 0) return [];
    const questions = await this.questionRepo.find({
      where: questionIds.map((id) => ({ id })),
    });
    return questions.map((q) => ({
      id: q.id,
      correctAnswer: q.correctAnswer,
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
        explanation: q.explanation,
      },
    }));
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

  private getCacheDir(folder: string): string {
    return path.join(this.getTextbookBase(), `${folder}_summation`, 'cache');
  }

  private getAvailableUnits(folder: string): number[] {
    const summationDir = path.join(
      this.getTextbookBase(),
      `${folder}_summation`,
    );
    if (!fs.existsSync(summationDir)) return [];
    const files = fs.readdirSync(summationDir);
    const units: number[] = [];
    for (const f of files) {
      const match = f.match(/^(\d+)단원\.md$/);
      if (match) units.push(parseInt(match[1], 10));
    }
    return units.sort((a, b) => a - b);
  }

  getCacheStatus() {
    const subjects = Object.entries(this.SUBJECT_FOLDER_MAP).map(
      ([slug, folder]) => {
        const cacheDir = this.getCacheDir(folder);
        const units: Array<{
          unitNumber: number;
          blank10: number | null;
          blank20: number | null;
          concept10: number | null;
          concept20: number | null;
        }> = [];

        const availableUnits = this.getAvailableUnits(folder);

        for (const unitNumber of availableUnits) {
          const entry: any = {
            unitNumber,
            blank10: null,
            blank20: null,
            concept10: null,
            concept20: null,
          };

          if (fs.existsSync(cacheDir)) {
            for (const type of ['blank', 'concept'] as const) {
              for (const count of [10, 20] as const) {
                const filePath = path.join(
                  cacheDir,
                  `${unitNumber}_${type}_${count}.json`,
                );
                if (fs.existsSync(filePath)) {
                  try {
                    const raw = fs.readFileSync(filePath, 'utf-8');
                    const arr = JSON.parse(raw);
                    entry[`${type}${count}`] = Array.isArray(arr)
                      ? arr.length
                      : null;
                  } catch {
                    entry[`${type}${count}`] = null;
                  }
                }
              }
            }
          }

          units.push(entry);
        }

        return {
          slug,
          title: this.SUBJECT_TITLE_MAP[slug] ?? slug,
          units,
        };
      },
    );

    return { subjects };
  }

  deleteCacheBulk(dto: DeleteCacheBulkDto): { deleted: number } {
    let deleted = 0;
    const slugs = dto.subjectSlug
      ? [dto.subjectSlug]
      : Object.keys(this.SUBJECT_FOLDER_MAP);

    for (const slug of slugs) {
      const folder = this.SUBJECT_FOLDER_MAP[slug];
      if (!folder) continue;

      const cacheDir = this.getCacheDir(folder);
      if (!fs.existsSync(cacheDir)) continue;

      const unitNumbers = dto.unitNumbers ?? this.getAvailableUnits(folder);
      const types: CacheType[] = dto.types ?? ['blank', 'concept'];
      const counts: QuizCount[] = [10, 20];

      for (const unitNumber of unitNumbers) {
        for (const type of types) {
          for (const count of counts) {
            const filePath = path.join(
              cacheDir,
              `${unitNumber}_${type}_${count}.json`,
            );
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              deleted++;
            }
          }
        }
      }
    }

    return { deleted };
  }

  regenerateCache(dto: RegenerateCacheDto): { status: string; total: number } {
    const folder = this.SUBJECT_FOLDER_MAP[dto.subjectSlug];
    if (!folder) return { status: 'error', total: 0 };

    const unitNumbers = dto.unitNumbers ?? this.getAvailableUnits(folder);
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

  getFrequencyConcept(subjectSlug: string, unitNumber: number): any {
    const folder = this.SUBJECT_FOLDER_MAP[subjectSlug];
    if (!folder) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }
    const cardsPath = path.join(
      this.getTextbookBase(),
      `${folder === 'sungjik' ? 'success' : 'kongil'}_cards_moi`,
      `${unitNumber}단원.json`,
    );
    const frequencyPath = path.join(
      this.getTextbookBase(),
      `${folder}_frequency`,
      `${unitNumber}단원.json`,
    );

    if (fs.existsSync(cardsPath)) {
      const raw = JSON.parse(fs.readFileSync(cardsPath, 'utf-8'));
      if (raw.concepts && raw.concepts.length >= 5) {
        return this.transformCardsToFrequency(raw);
      }
      if (fs.existsSync(frequencyPath)) {
        return JSON.parse(fs.readFileSync(frequencyPath, 'utf-8'));
      }
      return this.transformCardsToFrequency(raw);
    }

    if (!fs.existsSync(frequencyPath)) {
      throw new NotFoundException(
        `${subjectSlug} 과목의 ${unitNumber}단원 frequency concept 파일을 찾을 수 없습니다.`,
      );
    }
    return JSON.parse(fs.readFileSync(frequencyPath, 'utf-8'));
  }

  getMindmap(subjectSlug: string, unitNumber: number): any {
    const folder = this.SUBJECT_FOLDER_MAP[subjectSlug];
    if (!folder) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }
    const mindmapPath = path.join(
      this.getTextbookBase(),
      `${folder === 'sungjik' ? 'success' : folder}_mindmaps`,
      `${unitNumber}단원.json`,
    );
    if (!fs.existsSync(mindmapPath)) {
      throw new NotFoundException(
        `${subjectSlug} 과목의 ${unitNumber}단원 마인드맵을 찾을 수 없습니다.`,
      );
    }
    return JSON.parse(fs.readFileSync(mindmapPath, 'utf-8'));
  }

  private transformCardsToFrequency(raw: any): any {
    const concepts = (raw.concepts || []).map((c: any) => {
      const realQ = c.realQuestion?.questionData;
      const textbookExcerpt = c.card?.textbookExcerpt || '';
      const definition = c.card?.definition || '';
      const keyPoints = c.card?.keyPoints || [];
      const caution = c.caution || '';
      const conceptUsage = c.realQuestion?.conceptUsage || '';

      const conceptContentParts: string[] = [];
      if (definition) conceptContentParts.push(`## 개념 정의\n${definition}`);
      if (textbookExcerpt) conceptContentParts.push(`## 교과서 원문\n${textbookExcerpt}`);
      if (keyPoints.length) conceptContentParts.push(`## 핵심 포인트\n${keyPoints.map((p: string) => `- ${p}`).join('\n')}`);
      if (caution) conceptContentParts.push(`## ⚠️ 오답 주의\n${caution}`);
      if (conceptUsage) conceptContentParts.push(`## 실제 출제 포인트\n${conceptUsage}`);

      const guideSteps: any[] = [
        { type: 'intro', message: `${c.name}에 대해 알아보아요.` },
        { type: 'definition', title: c.name, content: definition },
      ];
      if (keyPoints.length) {
        guideSteps.push({ type: 'keypoints', title: '핵심 포인트', items: keyPoints });
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
      guideSteps.push({ type: 'guide', message: `${c.name}에 대해 잘 이해하셨나요? 다음으로 넘어가요!` });

      return {
        rank: c.rank,
        name: c.name,
        frequency: c.frequency,
        sources: c.sources || [],
        questionFormats: [],
         description: c.card?.enrichedDefinition || definition,
        keyPoints,
        examTips: caution ? [caution] : [],
        conceptContent: conceptContentParts.join('\n\n'),
        sampleQuestion: realQ
          ? {
              metadata: realQ.metadata || {
                source_exam: realQ.source_exam || '',
                question_number: realQ.number || 0,
                unit_name: raw.unitTitle || '',
                target_concept: c.name,
                item_type: '실전 모의고사',
                recommended_template: realQ.metadata?.recommended_template ?? undefined,
              },
              render_ready: {
                question_stem: this.stripQuestionNumber(realQ.render_ready?.question_stem || realQ.stem || ''),
                stimulus_data: realQ.render_ready?.stimulus_data ?? (realQ.stimulus ? { content: realQ.stimulus } : null),
                options_list: realQ.render_ready?.options_list || realQ.options || [],
                explanation: realQ.render_ready?.explanation || '',
              },
              combo_block: realQ.combo_block || (realQ.box_items && realQ.box_items.length > 0
                ? { title: '<보기>', items: realQ.box_items.map((text: string, i: number) => ({ key: ['ㄱ','ㄴ','ㄷ','ㄹ'][i] || `${i+1}`, text })) }
                : null),
              correct_answer: this.parseCorrectAnswer(realQ.correct_answer ?? realQ.answer),
              questionNumber: realQ.number || realQ.metadata?.question_number || null,
              questionSource: realQ.questionSource || realQ.source_exam || '',
              rawStimulus: realQ.stimulus ?? '',
            }
          : (c.quiz?.[0]
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
          : null),
        guideSteps,
        questionHighlights: [],
        questionExplanation: caution,
        clueAnalysis: conceptUsage
          ? {
              clueSteps: [{
                targetText: conceptUsage,
                location: '문제',
                explanation: conceptUsage,
                conceptLink: c.name,
              }],
              conclusion: caution,
              markedStimulus: '',
            }
          : undefined,
        conceptHighlight: c.realQuestion?.conceptHighlight || { inStimulus: [], inOptions: [], reason: '' },
              conceptHighlightV2: c.realQuestion?.conceptHighlightV2 || null,
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
      const circledMap: Record<string, number> = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
      if (circledMap[value]) return circledMap[value];
      const num = parseInt(value.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(num) && num >= 1 && num <= 5) return num;
    }
    return 1;
  }

  private stripQuestionNumber(stem: string): string {
    return stem.replace(/^\d+\.\s*/, '');
  }

  getStructuredConcept(subjectSlug: string, unitNumber: number): any {
    const folder = this.SUBJECT_FOLDER_MAP[subjectSlug];
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
  ): any | null {
    if (!sourceExam || !number) return null;
    const folders = ['success_cards_moi', 'kongil_cards_moi'];
    for (const folder of folders) {
      const base = path.join(this.getTextbookBase(), folder);
      if (!fs.existsSync(base)) continue;
      const files = fs.readdirSync(base).filter(f => /^\d+단원\.json$/.test(f));
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
                conceptHighlightV2: concept.realQuestion?.conceptHighlightV2 ?? null,
              };
            }
          }
        } catch { continue; }
      }
    }
    return null;
  }

  // ============================================================
  // 유사 문제 검색: 개념명 기준으로 cards_moi에서 검색
  // ============================================================
  findSimilarByConceptNames(
    conceptNames: string[],
    limit = 5,
  ): any[] {
    if (!conceptNames || conceptNames.length === 0) return [];
    const results: any[] = [];
    const folders = ['success_cards_moi', 'kongil_cards_moi'];
    for (const folder of folders) {
      const base = path.join(this.getTextbookBase(), folder);
      if (!fs.existsSync(base)) continue;
      const files = fs.readdirSync(base).filter(f => /^\d+단원\.json$/.test(f));
      for (const file of files) {
        if (results.length >= limit) break;
        try {
          const d = JSON.parse(fs.readFileSync(path.join(base, file), 'utf-8'));
          for (const concept of d.concepts ?? []) {
            if (results.length >= limit) break;
            const matchedNames = conceptNames.filter(name => {
              const nameWords = name.split(/\s+/).filter(w => w.length > 1);
              const conceptWords = concept.name.split(/\s+/).filter(w => w.length > 1);
              
              // 1. 완전 일치 또는 부분 문자열 일치
              if (concept.name.includes(name) || name.includes(concept.name)) return true;
              
              // 2. 단어 단위 교집합 확인
              return nameWords.some(nw => concept.name.includes(nw)) || 
                     conceptWords.some(cw => name.includes(cw));
            });
            if (matchedNames.length === 0) continue;
            const qd = concept.realQuestion?.questionData;
            if (!qd?.render_ready) continue;
            results.push({
              conceptName: concept.name,
              matchedConcepts: matchedNames,
              unitNumber: parseInt(file.replace('단원.json', ''), 10),
              sourceExam: qd.source_exam ?? '',
              questionNumber: qd.number ?? null,
              question: {
                metadata: qd.metadata ?? {},
                render_ready: qd.render_ready,
                combo_block: qd.combo_block ?? buildComboBlock(qd.box_items),
                correct_answer: parseAnswer(qd.correct_answer ?? qd.answer),
                rawStimulus: qd.stimulus ?? '',
              },
              conceptHighlightV2: concept.realQuestion?.conceptHighlightV2 ?? null,
            });
          }
        } catch { continue; }
      }
    }
    return results;
  }

}

function buildComboBlock(boxItems: string[] | undefined): { title: string; items: { key: string; text: string }[] } | null {
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
