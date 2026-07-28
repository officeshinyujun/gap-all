import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AdminService } from './admin.service';
import { User } from '../entities/user.entity';
import { Question } from '../entities/question.entity';
import { ExamRecord } from '../entities/exam-record.entity';
import { AiUsageLog } from '../entities/ai-usage-log.entity';
import { StudyProgress } from '../entities/study-progress.entity';
import { IncorrectRecord } from '../entities/incorrect-record.entity';
import { Subject } from '../entities/subject.entity';
import { Unit } from '../entities/unit.entity';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  genSalt: jest.fn().mockResolvedValue('salt'),
  hash: jest.fn().mockResolvedValue('hashed-new-password'),
}));

describe('AdminService', () => {
  let service: AdminService;
  let userRepo: jest.Mocked<Repository<User>>;
  let questionRepo: jest.Mocked<Repository<Question>>;
  let examRepo: jest.Mocked<Repository<ExamRecord>>;
  let progressRepo: jest.Mocked<Repository<StudyProgress>>;
  let incorrectRecordRepo: jest.Mocked<Repository<IncorrectRecord>>;

  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    name: '홍길동',
    passwordHash: 'old-hash',
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
    const mockRepo = () => ({
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: mockRepo() },
        { provide: getRepositoryToken(Question), useValue: mockRepo() },
        { provide: getRepositoryToken(ExamRecord), useValue: mockRepo() },
        { provide: getRepositoryToken(AiUsageLog), useValue: mockRepo() },
        { provide: getRepositoryToken(StudyProgress), useValue: mockRepo() },
        { provide: getRepositoryToken(IncorrectRecord), useValue: mockRepo() },
        { provide: getRepositoryToken(Subject), useValue: mockRepo() },
        { provide: getRepositoryToken(Unit), useValue: mockRepo() },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    userRepo = module.get(getRepositoryToken(User));
    questionRepo = module.get(getRepositoryToken(Question));
    examRepo = module.get(getRepositoryToken(ExamRecord));
    progressRepo = module.get(getRepositoryToken(StudyProgress));
    incorrectRecordRepo = module.get(getRepositoryToken(IncorrectRecord));
  });

  describe('getUsers', () => {
    it('passwordHash 없이 모든 사용자 반환', async () => {
      userRepo.find.mockResolvedValue([mockUser]);
      const result = await service.getUsers();
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('passwordHash');
      expect(result[0].email).toBe('test@example.com');
    });
  });

  describe('getStats', () => {
    it('전체 통계 반환', async () => {
      questionRepo.count.mockResolvedValue(500);
      examRepo.count.mockResolvedValue(100);
      questionRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValueOnce([{ difficulty: 'MIDDLE', count: '200' }])
          .mockResolvedValueOnce([{ template: 'TPL_ARTICLE', count: '150' }]),
      } as any);
      examRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ difficulty: 'HARD', count: '40' }]),
      } as any);

      const result = await service.getStats();
      expect(result.totalQuestions).toBe(500);
      expect(result.totalExams).toBe(100);
      expect(result.difficultyDistribution).toHaveLength(1);
    });
  });

  describe('changeUserRole', () => {
    it('사용자 역할 변경', async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      userRepo.save.mockResolvedValue({ ...mockUser, role: 'admin' });

      const result = await service.changeUserRole('user-1', 'admin');
      expect(result.message).toContain('변경되었습니다');
      expect(result.role).toBe('admin');
    });

    it('없는 사용자면 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.changeUserRole('none', 'admin')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resetUserPassword', () => {
    it('비밀번호 초기화', async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      userRepo.save.mockResolvedValue(mockUser);

      const result = await service.resetUserPassword('user-1', 'New!@#Pass123');
      expect(result.message).toContain('초기화');
    });
  });

  describe('deleteUser', () => {
    it('사용자 삭제', async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      userRepo.remove.mockResolvedValue(mockUser);

      const result = await service.deleteUser('user-1');
      expect(result.message).toContain('삭제');
    });

    it('없는 사용자면 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteUser('none')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteExam', () => {
    it('시험 삭제', async () => {
      examRepo.findOne.mockResolvedValue({ id: 'exam-1' } as ExamRecord);
      examRepo.remove.mockResolvedValue({} as ExamRecord);

      const result = await service.deleteExam('exam-1');
      expect(result.message).toContain('삭제');
    });

    it('없는 시험이면 NotFoundException', async () => {
      examRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteExam('none')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserProgress', () => {
    it('사용자 진도 정보 반환', async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      progressRepo.find.mockResolvedValue([
        {
          id: 'p-1',
          studyMode: 'BASIC_CONCEPT',
          progressPercent: 80,
          unit: { unitNumber: 1, title: '단원1', subject: { title: '과목1' } },
          lastStudiedAt: new Date(),
        },
      ] as any);

      const result = await service.getUserProgress('user-1');
      expect(result.user.name).toBe('홍길동');
      expect(result.progress).toHaveLength(1);
    });
  });

  describe('getIncorrectRecords', () => {
    it('오답 기록 조회 - QueryBuilder 체인 정상 동작', async () => {
      const qbMock = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'ir-1', userId: 'user-1',
            targetConcept: '개념A', incorrectCount: 3, isGraduated: false,
            lastIncorrectAt: new Date(),
            user: { id: 'user-1', name: '홍길동' },
            subject: { slug: 'success', title: '성공적인 직업생활' },
            unit: { unitNumber: 1, title: '단원1' },
          },
        ]),
      };
      incorrectRecordRepo.createQueryBuilder = jest.fn().mockReturnValue(qbMock);

      const result = await service.getIncorrectRecords({});
      expect(result).toHaveLength(1);
      expect(result[0].targetConcept).toBe('개념A');
    });
  });
});
