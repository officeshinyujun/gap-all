import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { getOpenAIApiKey } from '../lib/openai-keys';
import { User } from '../entities/user.entity';
import { Question } from '../entities/question.entity';
import { ExamRecord } from '../entities/exam-record.entity';
import { AiUsageLog } from '../entities/ai-usage-log.entity';
import { StudyProgress } from '../entities/study-progress.entity';
import { IncorrectRecord } from '../entities/incorrect-record.entity';
import { Subject } from '../entities/subject.entity';
import { Unit } from '../entities/unit.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(ExamRecord)
    private readonly examRepo: Repository<ExamRecord>,
    @InjectRepository(AiUsageLog)
    private readonly aiUsageLogRepo: Repository<AiUsageLog>,
    @InjectRepository(StudyProgress)
    private readonly progressRepo: Repository<StudyProgress>,
    @InjectRepository(IncorrectRecord)
    private readonly incorrectRecordRepo: Repository<IncorrectRecord>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
  ) {}

  // ============================================================
  // 시험 목록 (유저 정보 포함)
  // ============================================================
  async getExams() {
    const exams = await this.examRepo
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.subject', 'subject')
      .leftJoin('exam.user', 'user')
      .addSelect(['user.id', 'user.email', 'user.name'])
      .orderBy('exam.createdAt', 'DESC')
      .getMany();

    return exams.map((exam) => ({
      id: exam.id,
      title: exam.title,
      difficulty: exam.difficulty,
      questionCount: exam.questionCount,
      totalScore: exam.totalScore,
      sourceType: exam.sourceType ?? null,
      createdAt: exam.createdAt,
      subject: exam.subject
        ? { slug: exam.subject.slug, title: exam.subject.title }
        : null,
      user: (exam as any).user
        ? {
            id: (exam as any).user.id,
            email: (exam as any).user.email,
            name: (exam as any).user.name,
          }
        : null,
    }));
  }

  // ============================================================
  // 유저 목록
  // ============================================================
  async getUsers() {
    const users = await this.userRepo.find({
      order: { createdAt: 'DESC' },
    });
    return users.map(({ passwordHash, ...safe }) => {
      void passwordHash;
      return safe;
    });
  }

  // ============================================================
  // DB 통계
  // ============================================================
  async getStats() {
    const totalQuestions = await this.questionRepo.count();
    const totalExams = await this.examRepo.count();

    // 난이도별 문항 분포
    const difficultyRaw = await this.questionRepo
      .createQueryBuilder('q')
      .select('q.difficulty', 'difficulty')
      .addSelect('COUNT(*)', 'count')
      .groupBy('q.difficulty')
      .getRawMany();

    // 템플릿별 문항 분포
    const templateRaw = await this.questionRepo
      .createQueryBuilder('q')
      .select('q.recommended_template', 'template')
      .addSelect('COUNT(*)', 'count')
      .groupBy('q.recommended_template')
      .orderBy('count', 'DESC')
      .getRawMany();

    // 시험 난이도별 분포
    const examDifficultyRaw = await this.examRepo
      .createQueryBuilder('e')
      .select('e.difficulty', 'difficulty')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.difficulty')
      .getRawMany();

    return {
      totalQuestions,
      totalExams,
      difficultyDistribution: difficultyRaw.map((r) => ({
        difficulty: r.difficulty,
        count: Number(r.count),
      })),
      templateDistribution: templateRaw.map((r) => ({
        template: r.template,
        count: Number(r.count),
      })),
      examDifficultyDistribution: examDifficultyRaw.map((r) => ({
        difficulty: r.difficulty,
        count: Number(r.count),
      })),
    };
  }

  // ============================================================
  // OpenAI API 사용량
  // ============================================================
  async getOpenAIUsage() {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const startDate = sevenDaysAgo.toISOString().slice(0, 10);
    const endDate = now.toISOString().slice(0, 10);

    // ── DB 집계 ──────────────────────────────────────────────
    const dbRows: {
      date: string;
      source: string;
      model: string;
      prompt_tokens: string;
      completion_tokens: string;
      total_tokens: string;
      n_requests: string;
    }[] = await this.aiUsageLogRepo
      .createQueryBuilder('log')
      .select(
        "TO_CHAR(log.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')",
        'date',
      )
      .addSelect('log.source', 'source')
      .addSelect('log.model', 'model')
      .addSelect('SUM(log.prompt_tokens)', 'prompt_tokens')
      .addSelect('SUM(log.completion_tokens)', 'completion_tokens')
      .addSelect('SUM(log.total_tokens)', 'total_tokens')
      .addSelect('COUNT(*)', 'n_requests')
      .where('log.created_at >= :from', { from: sevenDaysAgo })
      .groupBy(
        "TO_CHAR(log.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')",
      )
      .addGroupBy('log.source')
      .addGroupBy('log.model')
      .orderBy('date', 'DESC')
      .getRawMany();

    const dbData = dbRows.map((r) => ({
      date: r.date,
      source: r.source,
      model: r.model,
      promptTokens: Number(r.prompt_tokens),
      completionTokens: Number(r.completion_tokens),
      totalTokens: Number(r.total_tokens),
      nRequests: Number(r.n_requests),
    }));

    // ── OpenAI Usage API v2 (보조, 실패해도 DB 데이터는 반환) ──
    let openaiData:
      | {
          date: string;
          model: string;
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
          nRequests: number;
        }[]
      | null = null;
    let openaiError: string | null = null;

    const apiKey = process.env.OPENAI_ADMIN_KEY ?? getOpenAIApiKey();
    if (apiKey) {
      try {
        const startUnix = Math.floor(sevenDaysAgo.getTime() / 1000);
        const endUnix = Math.floor(now.getTime() / 1000);

        const res = await fetch(
          `https://api.openai.com/v1/organization/usage/completions?start_time=${startUnix}&end_time=${endUnix}&bucket_width=1d`,
          { headers: { Authorization: `Bearer ${apiKey}` } },
        );

        if (res.ok) {
          const json = await res.json();
          const buckets: any[] = json.data ?? [];
          openaiData = buckets.flatMap((bucket) =>
            (bucket.results ?? []).map((r: any) => ({
              date: new Date(bucket.start_time * 1000)
                .toISOString()
                .slice(0, 10),
              model: r.model ?? 'unknown',
              promptTokens: r.input_tokens ?? 0,
              completionTokens: r.output_tokens ?? 0,
              totalTokens: (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
              nRequests: r.num_model_requests ?? 0,
            })),
          );
        } else if (res.status === 403) {
          openaiError =
            'OpenAI API 접근 권한이 없습니다. Admin key를 확인해주세요.';
        } else {
          const err = await res.json().catch(() => ({}));
          openaiError =
            err?.error?.message ?? `OpenAI API 오류 (${res.status})`;
        }
      } catch (e) {
        openaiError = e instanceof Error ? e.message : '알 수 없는 오류';
      }
    } else {
      openaiError = 'OPENAI_API_KEY가 설정되지 않았습니다.';
    }

    return {
      available: true,
      startDate,
      endDate,
      db: dbData,
      openai: openaiData,
      openaiError,
    };
  }

  // ============================================================
  // 시험 삭제
  // ============================================================
  async deleteExam(examId: string) {
    const exam = await this.examRepo.findOne({ where: { id: examId } });
    if (!exam)
      throw new NotFoundException(`시험을 찾을 수 없습니다: ${examId}`);
    await this.examRepo.remove(exam);
    return { message: '시험이 삭제되었습니다.' };
  }

  // ============================================================
  // 유저 역할 변경 (new)
  // ============================================================
  async changeUserRole(userId: string, role: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('유저를 찾을 수 없습니다.');
    user.role = role as 'user' | 'admin';
    await this.userRepo.save(user);
    return { message: '역할이 변경되었습니다.', role };
  }

  // ============================================================
  // 유저 비밀번호 초기화
  // ============================================================
  async resetUserPassword(userId: string, newPassword: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('유저를 찾을 수 없습니다.');
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await this.userRepo.save(user);
    return { message: '비밀번호가 초기화되었습니다.' };
  }

  // ============================================================
  // 유저 삭제
  // ============================================================
  async deleteUser(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user)
      throw new NotFoundException(`유저를 찾을 수 없습니다: ${userId}`);
    await this.userRepo.remove(user);
    return { message: '유저가 삭제되었습니다.' };
  }

  // ============================================================
  // 유저 역할 변경
  // ============================================================
  async updateUserRole(userId: string, role: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user)
      throw new NotFoundException(`유저를 찾을 수 없습니다: ${userId}`);
    if (role !== 'user' && role !== 'admin') {
      throw new NotFoundException(`유효하지 않은 역할입니다: ${role}`);
    }
    user.role = role;
    await this.userRepo.save(user);
    return { message: `역할이 ${role}로 변경되었습니다.` };
  }

  // ============================================================
  // 유저별 학습 진척도 조회
  // ============================================================
  async getUserProgress(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user)
      throw new NotFoundException(`유저를 찾을 수 없습니다: ${userId}`);

    const progress = await this.progressRepo.find({
      where: { userId },
      relations: ['unit', 'unit.subject'],
      order: { lastStudiedAt: 'DESC' },
    });

    return {
      user: { id: user.id, name: user.name, email: user.email },
      progress: progress.map((p) => ({
        id: p.id,
        unitNumber: p.unit?.unitNumber,
        unitTitle: p.unit?.title,
        subjectTitle: (p.unit as any)?.subject?.title,
        studyMode: p.studyMode,
        progressPercent: p.progressPercent,
        lastStudiedAt: p.lastStudiedAt,
      })),
    };
  }

  // ============================================================
  // 유저 진척도 초기화
  // ============================================================
  async resetUserProgress(userId: string) {
    const result = await this.progressRepo.delete({ userId });
    return { message: `진척도 ${result.affected}개가 초기화되었습니다.` };
  }

  // ============================================================
  // 전체 유저 진척도 요약
  // ============================================================
  async getAllUsersProgress() {
    const users = await this.userRepo.find({ order: { createdAt: 'DESC' } });
    const result = await Promise.all(
      users.map(async (user) => {
        const count = await this.progressRepo.count({
          where: { userId: user.id },
        });
        const completed = await this.progressRepo.count({
          where: { userId: user.id, progressPercent: 100 },
        });
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          totalProgress: count,
          completedProgress: completed,
        };
      }),
    );
    return result;
  }

  // ============================================================
  // Question DB 관리
  // ============================================================
  async getQuestions(filters: {
    subjectSlug?: string;
    unitNumber?: number;
    difficulty?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const qb = this.questionRepo
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.subject', 'subject')
      .leftJoinAndSelect('q.unit', 'unit')
      .orderBy('q.createdAt', 'DESC');

    if (filters.subjectSlug) {
      qb.andWhere('subject.slug = :slug', { slug: filters.subjectSlug });
    }
    if (filters.unitNumber) {
      qb.andWhere('unit.unitNumber = :unitNumber', {
        unitNumber: filters.unitNumber,
      });
    }
    if (filters.difficulty) {
      qb.andWhere('q.difficulty = :difficulty', {
        difficulty: filters.difficulty,
      });
    }
    if (filters.search) {
      qb.andWhere(
        '(q.questionStem ILIKE :search OR q.targetConcept ILIKE :search OR q.explanation::text ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    qb.take(filters.limit ?? 50).skip(filters.offset ?? 0);

    return qb.getMany();
  }

  async getQuestionStats() {
    const total = await this.questionRepo.count();

    const bySubjectRaw = await this.questionRepo
      .createQueryBuilder('q')
      .leftJoin('q.subject', 'subject')
      .select('subject.slug', 'slug')
      .addSelect('subject.title', 'title')
      .addSelect('COUNT(*)', 'count')
      .groupBy('subject.slug')
      .addGroupBy('subject.title')
      .getRawMany();

    const byDifficultyRaw = await this.questionRepo
      .createQueryBuilder('q')
      .select('q.difficulty', 'difficulty')
      .addSelect('COUNT(*)', 'count')
      .groupBy('q.difficulty')
      .getRawMany();

    const byUnitRaw = await this.questionRepo
      .createQueryBuilder('q')
      .leftJoin('q.subject', 'subject')
      .leftJoin('q.unit', 'unit')
      .select('subject.slug', 'subjectSlug')
      .addSelect('unit.unitNumber', 'unitNumber')
      .addSelect('COUNT(*)', 'count')
      .groupBy('subject.slug')
      .addGroupBy('unit.unitNumber')
      .getRawMany();

    return {
      total,
      bySubject: bySubjectRaw.map((r) => ({
        slug: r.slug,
        title: r.title,
        count: Number(r.count),
      })),
      byDifficulty: byDifficultyRaw.map((r) => ({
        difficulty: r.difficulty,
        count: Number(r.count),
      })),
      byUnit: byUnitRaw.map((r) => ({
        subjectSlug: r.subjectSlug,
        unitNumber: Number(r.unitNumber),
        count: Number(r.count),
      })),
    };
  }

  async deleteQuestion(id: string) {
    const question = await this.questionRepo.findOne({ where: { id } });
    if (!question)
      throw new NotFoundException(`문제를 찾을 수 없습니다: ${id}`);
    await this.questionRepo.remove(question);
    return { message: '문제가 삭제되었습니다.' };
  }

  // ============================================================
  // IncorrectRecord 관리
  // ============================================================
  async getIncorrectRecords(filters: {
    userId?: string;
    subjectSlug?: string;
    isGraduated?: string;
    limit?: number;
    offset?: number;
  }) {
    const qb = this.incorrectRecordRepo
      .createQueryBuilder('ir')
      .leftJoinAndSelect('ir.user', 'user')
      .leftJoinAndSelect('ir.subject', 'subject')
      .leftJoinAndSelect('ir.unit', 'unit')
      .orderBy('ir.lastIncorrectAt', 'DESC');

    if (filters.userId) {
      qb.andWhere('ir.userId = :userId', { userId: filters.userId });
    }
    if (filters.subjectSlug) {
      qb.andWhere('subject.slug = :slug', { slug: filters.subjectSlug });
    }
    if (filters.isGraduated === 'true') {
      qb.andWhere('ir.isGraduated = :grad', { grad: true });
    } else if (filters.isGraduated === 'false') {
      qb.andWhere('ir.isGraduated = :grad', { grad: false });
    }

    qb.take(filters.limit ?? 50).skip(filters.offset ?? 0);

    return qb.getMany();
  }

  async getIncorrectRecordStats() {
    const total = await this.incorrectRecordRepo.count();
    const graduated = await this.incorrectRecordRepo.count({
      where: { isGraduated: true },
    });
    const active = total - graduated;

    const bySubjectRaw = await this.incorrectRecordRepo
      .createQueryBuilder('ir')
      .leftJoin('ir.subject', 'subject')
      .select('subject.slug', 'slug')
      .addSelect('subject.title', 'title')
      .addSelect('COUNT(*)', 'count')
      .groupBy('subject.slug')
      .addGroupBy('subject.title')
      .getRawMany();

    const topConceptsRaw = await this.incorrectRecordRepo
      .createQueryBuilder('ir')
      .select('ir.targetConcept', 'targetConcept')
      .addSelect('COUNT(*)', 'count')
      .groupBy('ir.targetConcept')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      total,
      graduated,
      active,
      bySubject: bySubjectRaw.map((r) => ({
        slug: r.slug,
        title: r.title,
        count: Number(r.count),
      })),
      topConcepts: topConceptsRaw.map((r) => ({
        targetConcept: r.targetConcept,
        count: Number(r.count),
      })),
    };
  }

  async deleteIncorrectRecord(id: string) {
    const record = await this.incorrectRecordRepo.findOne({ where: { id } });
    if (!record)
      throw new NotFoundException(`오답 기록을 찾을 수 없습니다: ${id}`);
    await this.incorrectRecordRepo.remove(record);
    return { message: '오답 기록이 삭제되었습니다.' };
  }

  async bulkDeleteIncorrectRecords(filters: {
    userId?: string;
    subjectSlug?: string;
  }) {
    const qb = this.incorrectRecordRepo.createQueryBuilder('ir');

    if (filters.subjectSlug) {
      qb.leftJoin('ir.subject', 'subject');
    }

    const where: string[] = [];
    const params: Record<string, any> = {};

    if (filters.userId) {
      where.push('ir.userId = :userId');
      params.userId = filters.userId;
    }
    if (filters.subjectSlug) {
      where.push('subject.slug = :slug');
      params.slug = filters.subjectSlug;
    }

    if (where.length > 0) {
      const deleteQb = this.incorrectRecordRepo.createQueryBuilder('ir');
      if (filters.subjectSlug) {
        deleteQb.leftJoin('ir.subject', 'subject');
      }
      deleteQb.where(where.join(' AND '), params);
      const records = await deleteQb.getMany();
      if (records.length > 0) {
        await this.incorrectRecordRepo.remove(records);
      }
      return { deleted: records.length };
    }

    const count = await this.incorrectRecordRepo.count();
    await this.incorrectRecordRepo.clear();
    return { deleted: count };
  }
}
