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

  async addConceptBookmark(userId: string, data: { subjectSlug: string; unitNumber: number; conceptName: string; description?: string }) {
    const existing = await this.conceptBookmarkRepo.findOne({
      where: { userId, subjectSlug: data.subjectSlug, unitNumber: data.unitNumber, conceptName: data.conceptName },
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
    const bookmark = await this.conceptBookmarkRepo.findOne({ where: { id: bookmarkId, userId } });
    if (!bookmark) throw new NotFoundException('북마크를 찾을 수 없습니다.');
    await this.conceptBookmarkRepo.remove(bookmark);
    return { message: '삭제되었습니다.' };
  }
}
