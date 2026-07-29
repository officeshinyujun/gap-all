import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { StudyController } from './study.controller';
import { StudyService } from './study.service';
import { TextbookEmbeddingService } from '../textbook/textbook-embedding.service';

describe('StudyController', () => {
  let controller: StudyController;
  let studyService: jest.Mocked<Partial<StudyService>>;
  let embeddingService: jest.Mocked<Partial<TextbookEmbeddingService>>;

  const adminUser = { id: 'admin-1', email: 'admin@test.com', role: 'admin' };
  const studentUser = { id: 'user-1', email: 'user@test.com', role: 'user' };

  beforeEach(async () => {
    studyService = {
      getStreak: jest.fn(),
      getReviewRecommendations: jest.fn(),
      updateProgress: jest.fn(),
      saveIncorrectRecords: jest.fn(),
      submitReviewResult: jest.fn(),
      createReviewExamJob: jest.fn(),
      getReviewQuestions: jest.fn(),
      submitReviewAnswer: jest.fn(),
      getConceptBookmarks: jest.fn(),
      addConceptBookmark: jest.fn(),
      removeConceptBookmark: jest.fn(),
      getProgressBySubject: jest.fn(),
      getUnitsWithProgress: jest.fn(),
      getFrequencyConcept: jest.fn(),
      getMindmap: jest.fn(),
      getConceptByName: jest.fn(),
      getStructuredConcept: jest.fn(),
      getConceptMd: jest.fn(),
      getBlankQuestions: jest.fn(),
      getConceptPairs: jest.fn(),
      getSummationCards: jest.fn(),
      getSummationV2Cards: jest.fn(),
      updateSummationCards: jest.fn(),
      getCacheStatus: jest.fn(),
      deleteCacheBulk: jest.fn(),
      regenerateCache: jest.fn(),
      getRegenerationStatus: jest.fn(),
      clearCache: jest.fn(),
    };
    embeddingService = {
      embedAllUnits: jest.fn(),
      embedUnit: jest.fn(),
      getEmbeddingStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudyController],
      providers: [
        { provide: StudyService, useValue: studyService },
        { provide: TextbookEmbeddingService, useValue: embeddingService },
      ],
    }).compile();

    controller = module.get<StudyController>(StudyController);
  });

  describe('getStreak', () => {
    it('학습 스트릭 반환', async () => {
      studyService.getStreak.mockResolvedValue({ studyStreakDays: 7 });
      const result = await controller.getStreak(studentUser as any);
      expect(result).toEqual({ studyStreakDays: 7 });
    });
  });

  describe('updateProgress', () => {
    it('진도 업데이트', async () => {
      studyService.updateProgress.mockResolvedValue({ progress: {} as any });
      const result = await controller.updateProgress(studentUser as any, {
        unitId: 'u-1', studyMode: 'BASIC_CONCEPT', progressPercent: 80,
      });
      expect(result).toHaveProperty('progress');
    });
  });

  describe('getConcept', () => {
    it('개념을 찾으면 found: true', async () => {
      studyService.getConceptByName.mockResolvedValue({
        title: '개념A', description: '설명', bulletPoints: [], trapPoints: [], logicFlow: '',
      });
      const result = await controller.getConcept('success', 1, '개념A');
      expect(result.found).toBe(true);
      expect(result.title).toBe('개념A');
    });

    it('개념을 못 찾으면 found: false', async () => {
      studyService.getConceptByName.mockResolvedValue(null);
      const result = await controller.getConcept('success', 1, '없는개념');
      expect(result.found).toBe(false);
    });
  });

  describe('cache admin-only endpoints', () => {
    it('관리자가 아닌 사용자는 cache-status 접근 불가', () => {
      expect(() => controller.getCacheStatus(studentUser as any)).toThrow(ForbiddenException);
    });

    it('관리자는 cache-status 접근 가능', () => {
      studyService.getCacheStatus.mockReturnValue({ subjects: [] });
      const result = controller.getCacheStatus(adminUser as any);
      expect(result).toEqual({ subjects: [] });
    });

    it('관리자가 아닌 사용자는 shared content, cache, embedding 관리 불가', async () => {
      expect(() => controller.deleteCacheBulk(studentUser as any, {})).toThrow(ForbiddenException);
      expect(() => controller.regenerateCache(studentUser as any, { subjectSlug: 'success' })).toThrow(ForbiddenException);
      expect(() => controller.getRegenerationStatus(studentUser as any)).toThrow(ForbiddenException);
      expect(() => controller.clearCache(studentUser as any, 'success', 1)).toThrow(ForbiddenException);
      await expect(controller.embedAllUnits(studentUser as any, 'success')).rejects.toThrow(ForbiddenException);
      await expect(controller.embedUnit(studentUser as any, 'success', 1)).rejects.toThrow(ForbiddenException);
      await expect(controller.getEmbeddingStatus(studentUser as any, 'success')).rejects.toThrow(ForbiddenException);
      await expect(
        controller.updateSummationCards(studentUser as any, 'success', 1, { cards: [] }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('review questions', () => {
    it('현재 사용자의 소유권 확인과 함께 복습 문제를 요청한다', async () => {
      (studyService.getReviewQuestions as jest.Mock).mockResolvedValue([]);

      await controller.getReviewQuestions(studentUser as any, { questionIds: ['question-1'] });

      expect(studyService.getReviewQuestions).toHaveBeenCalledWith('user-1', ['question-1']);
    });

    it('답안을 제출한 후에만 정답 피드백을 요청한다', async () => {
      (studyService.submitReviewAnswer as jest.Mock).mockResolvedValue({
        correctAnswer: 2,
        explanation: { judgment: '설명' },
        isCorrect: true,
      });

      const result = await controller.submitReviewAnswer(studentUser as any, 'question-1', { answer: 2 });

      expect(studyService.submitReviewAnswer).toHaveBeenCalledWith('user-1', 'question-1', 2);
      expect(result.isCorrect).toBe(true);
    });
  });
});
