import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { StudyService } from './study.service';
import { StudyQuizGeneratorService } from './study-quiz-generator.service';
import { ExamsService } from '../exams/exams.service';
import { TextbookEmbeddingService } from '../textbook/textbook-embedding.service';
import { StudyProgress } from '../entities/study-progress.entity';
import { Unit } from '../entities/unit.entity';
import { Subject } from '../entities/subject.entity';
import { User } from '../entities/user.entity';
import { IncorrectRecord } from '../entities/incorrect-record.entity';
import { Question } from '../entities/question.entity';
import { ConceptBookmark } from '../entities/concept-bookmark.entity';

describe('StudyService', () => {
  let service: StudyService;
  let subjectRepo: jest.Mocked<Repository<Subject>>;
  let unitRepo: jest.Mocked<Repository<Unit>>;
  let progressRepo: jest.Mocked<Repository<StudyProgress>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let incorrectRecordRepo: jest.Mocked<Repository<IncorrectRecord>>;
  let questionRepo: jest.Mocked<Repository<Question>>;
  let conceptBookmarkRepo: jest.Mocked<Repository<ConceptBookmark>>;
  let quizGenerator: jest.Mocked<StudyQuizGeneratorService>;
  let examsService: jest.Mocked<ExamsService>;

  const mockSubject: Subject = {
    id: 'subj-1',
    slug: 'success',
    title: '성공적인 직업생활',
    units: [],
    exams: [],
    studyProgressList: [],
    incorrectRecords: [],
  };

  const mockUnit: Unit = {
    id: 'unit-1',
    subjectId: 'subj-1',
    unitNumber: 1,
    title: '일과 직업 및 직업 생활',
    subject: mockSubject,
    studyProgressList: [],
    incorrectRecords: [],
  };

  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    name: '홍길동',
    passwordHash: null,
    provider: null,
    providerId: null,
    profileImageUrl: null,
    birthday: null,
    studyStreakDays: 5,
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    refreshTokens: [],
    progress: [],
    exams: [],
    chatSessions: [],
  };

  beforeEach(async () => {
    const mockProgressRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const mockUnitRepo = { findOne: jest.fn(), find: jest.fn() };
    const mockSubjectRepo = { findOne: jest.fn() };
    const mockUserRepo = { findOne: jest.fn(), update: jest.fn() };
    const mockIncorrectRecordRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const mockQuestionRepo = { find: jest.fn() };
    const mockConceptBookmarkRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const mockQuizGenerator = {
      getSummationMd: jest.fn(),
      generateBlankQuestions: jest.fn(),
      generateConceptPairs: jest.fn(),
      clearCache: jest.fn(),
    };
    const mockExamsService = { createJob: jest.fn() };
    const mockEmbeddingService = { embedUnit: jest.fn(), embedAllUnits: jest.fn(), getEmbeddingStatus: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudyService,
        { provide: getRepositoryToken(StudyProgress), useValue: mockProgressRepo },
        { provide: getRepositoryToken(Unit), useValue: mockUnitRepo },
        { provide: getRepositoryToken(Subject), useValue: mockSubjectRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(IncorrectRecord), useValue: mockIncorrectRecordRepo },
        { provide: getRepositoryToken(Question), useValue: mockQuestionRepo },
        { provide: getRepositoryToken(ConceptBookmark), useValue: mockConceptBookmarkRepo },
        { provide: StudyQuizGeneratorService, useValue: mockQuizGenerator },
        { provide: ExamsService, useValue: mockExamsService },
        { provide: TextbookEmbeddingService, useValue: mockEmbeddingService },
      ],
    }).compile();

    service = module.get<StudyService>(StudyService);
    subjectRepo = module.get(getRepositoryToken(Subject));
    unitRepo = module.get(getRepositoryToken(Unit));
    progressRepo = module.get(getRepositoryToken(StudyProgress));
    userRepo = module.get(getRepositoryToken(User));
    incorrectRecordRepo = module.get(getRepositoryToken(IncorrectRecord));
    questionRepo = module.get(getRepositoryToken(Question));
    conceptBookmarkRepo = module.get(getRepositoryToken(ConceptBookmark));
    quizGenerator = module.get(StudyQuizGeneratorService);
    examsService = module.get(ExamsService);
  });

  // ───────────────────────────────────────────
  // getProgressBySubject
  // ───────────────────────────────────────────
  describe('getProgressBySubject', () => {
    it('과목의 학습 진도 정보 반환', async () => {
      subjectRepo.findOne.mockResolvedValue(mockSubject);
      unitRepo.find.mockResolvedValue([mockUnit]);
      progressRepo.find.mockResolvedValue([
        {
          id: 'p-1', userId: 'user-1', unitId: 'unit-1',
          studyMode: 'BASIC_CONCEPT', progressPercent: 100,
          unit: { ...mockUnit, subjectId: 'subj-1' },
          lastStudiedAt: new Date(),
        } as StudyProgress,
      ]);

      const result = await service.getProgressBySubject('user-1', 'success');
      expect(result.subject.slug).toBe('success');
      expect(result.totalUnits).toBe(1);
    });

    it('없는 과목이면 NotFoundException', async () => {
      subjectRepo.findOne.mockResolvedValue(null);
      await expect(service.getProgressBySubject('user-1', 'none')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ───────────────────────────────────────────
  // getUnitsWithProgress
  // ───────────────────────────────────────────
  describe('getUnitsWithProgress', () => {
    it('단원 목록과 진도율 반환', async () => {
      subjectRepo.findOne.mockResolvedValue(mockSubject);
      unitRepo.find.mockResolvedValue([mockUnit]);
      progressRepo.find.mockResolvedValue([]);

      const result = await service.getUnitsWithProgress('user-1', 'success');
      expect(result.units).toHaveLength(1);
      expect(result.units[0].progress).toBe(0);
    });

    it('학습 모드별 진도 정보 포함', async () => {
      subjectRepo.findOne.mockResolvedValue(mockSubject);
      unitRepo.find.mockResolvedValue([mockUnit]);
      progressRepo.find.mockResolvedValue([
        {
          id: 'p-1', userId: 'user-1', unitId: 'unit-1',
          studyMode: 'BASIC_CONCEPT', progressPercent: 50,
          unit: { ...mockUnit, subjectId: 'subj-1' },
          lastStudiedAt: new Date(),
        } as StudyProgress,
      ]);

      const result = await service.getUnitsWithProgress('user-1', 'success');
      expect(result.units[0].progress).toBe(10); // 50 / 5 modes = 10
      expect(result.units[0].subUnits).toHaveLength(1);
    });
  });

  // ───────────────────────────────────────────
  // updateProgress
  // ───────────────────────────────────────────
  describe('updateProgress', () => {
    it('기존 진도가 있으면 업데이트', async () => {
      unitRepo.findOne.mockResolvedValue(mockUnit);
      progressRepo.findOne.mockResolvedValue({
        id: 'p-1', userId: 'user-1', unitId: 'unit-1',
        studyMode: 'BASIC_CONCEPT', progressPercent: 0,
        lastStudiedAt: new Date(),
      } as StudyProgress);
      progressRepo.save.mockResolvedValue({} as StudyProgress);
      progressRepo.find.mockResolvedValue([]);
      userRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.updateProgress('user-1', {
        unitId: 'unit-1',
        studyMode: 'BASIC_CONCEPT',
        progressPercent: 80,
      });

      expect(result).toHaveProperty('progress');
    });

    it('없는 단원이면 NotFoundException', async () => {
      unitRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateProgress('user-1', {
          unitId: 'invalid', studyMode: 'BASIC_CONCEPT', progressPercent: 50,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────────────────────────
  // getStreak
  // ───────────────────────────────────────────
  describe('getStreak', () => {
    it('사용자 학습 스트릭 반환', async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      const result = await service.getStreak('user-1');
      expect(result.studyStreakDays).toBe(5);
    });

    it('없는 사용자면 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.getStreak('none')).rejects.toThrow(NotFoundException);
    });
  });

  // ───────────────────────────────────────────
  // submitReviewResult
  // ───────────────────────────────────────────
  describe('submitReviewResult', () => {
    it('정답이면 consecutiveCorrect 증가, 3회 이상이면 졸업', async () => {
      incorrectRecordRepo.findOne.mockResolvedValue({
        id: 'r-1',
        userId: 'user-1',
        consecutiveCorrect: 2,
        incorrectCount: 1,
        isGraduated: false,
      } as IncorrectRecord);
      incorrectRecordRepo.save.mockResolvedValue({} as IncorrectRecord);

      const result = await service.submitReviewResult('user-1', {
        results: [{ targetConcept: '개념A', unitId: 'unit-1', source: 'exam', isCorrect: true }],
      });

      expect(result.updated).toBe(1);
      expect(result.graduated).toBe(1);
    });

    it('오답이면 consecutiveCorrect 리셋', async () => {
      incorrectRecordRepo.findOne.mockResolvedValue({
        id: 'r-1',
        userId: 'user-1',
        consecutiveCorrect: 2,
        incorrectCount: 1,
        isGraduated: false,
      } as IncorrectRecord);
      incorrectRecordRepo.save.mockResolvedValue({} as IncorrectRecord);

      const result = await service.submitReviewResult('user-1', {
        results: [{ targetConcept: '개념A', unitId: 'unit-1', source: 'exam', isCorrect: false }],
      });

      expect(result.updated).toBe(1);
      expect(result.graduated).toBe(0);
    });
  });

  // ───────────────────────────────────────────
  // getReviewRecommendations
  // ───────────────────────────────────────────
  describe('getReviewRecommendations', () => {
    it('복습 추천 목록을 점수 순으로 반환', async () => {
      incorrectRecordRepo.find.mockResolvedValue([
        {
          id: 'r-1', userId: 'user-1', targetConcept: '개념A',
          incorrectCount: 3, isGraduated: false, lastReviewedAt: new Date(),
          source: 'exam', questionId: null,
          unit: { ...mockUnit, unitNumber: 1, title: '테스트' },
          subject: mockSubject,
        },
        {
          id: 'r-2', userId: 'user-1', targetConcept: '개념B',
          incorrectCount: 1, isGraduated: false, lastReviewedAt: null,
          source: 'study', questionId: null,
          unit: { ...mockUnit, unitNumber: 2, title: '테스트2' },
          subject: mockSubject,
        },
      ] as any);

      const result = await service.getReviewRecommendations('user-1');
      expect(result.recommendations.length).toBeGreaterThan(0);
      // 개념A(3*2=6점)가 개념B(1*2+5=7점)보다 점수가 높은지 확인
      const scores = result.recommendations.map((r) => r.score);
      expect(scores[0]).toBeGreaterThanOrEqual(scores[1] ?? Infinity);
    });
  });

  // ───────────────────────────────────────────
  // concept bookmarks
  // ───────────────────────────────────────────
  describe('conceptBookmarks', () => {
    it('북마크 추가 (중복 방지)', async () => {
      conceptBookmarkRepo.findOne.mockResolvedValue(null);
      conceptBookmarkRepo.create.mockReturnValue({
        id: 'b-1', userId: 'user-1', subjectSlug: 'success',
        unitNumber: 1, conceptName: '개념A',
      } as ConceptBookmark);
      conceptBookmarkRepo.save.mockResolvedValue({} as ConceptBookmark);

      const result = await service.addConceptBookmark('user-1', {
        subjectSlug: 'success', unitNumber: 1, conceptName: '개념A',
      });
      expect(result).toBeDefined();
    });

    it('이미 존재하는 북마크면 기존 것 반환', async () => {
      const existing = { id: 'b-1' } as ConceptBookmark;
      conceptBookmarkRepo.findOne.mockResolvedValue(existing);
      const result = await service.addConceptBookmark('user-1', {
        subjectSlug: 'success', unitNumber: 1, conceptName: '개념A',
      });
      expect(result).toBe(existing);
    });

    it('북마크 삭제', async () => {
      conceptBookmarkRepo.findOne.mockResolvedValue({ id: 'b-1' } as ConceptBookmark);
      conceptBookmarkRepo.remove.mockResolvedValue({} as ConceptBookmark);
      const result = await service.removeConceptBookmark('user-1', 'b-1');
      expect(result).toEqual({ message: '삭제되었습니다.' });
    });

    it('없는 북마크 삭제 시 NotFoundException', async () => {
      conceptBookmarkRepo.findOne.mockResolvedValue(null);
      await expect(service.removeConceptBookmark('user-1', 'b-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
