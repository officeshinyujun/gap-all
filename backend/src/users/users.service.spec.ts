import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from '../entities/user.entity';
import { StudyProgress } from '../entities/study-progress.entity';
import { UpdateUserDto } from './dto/update-user.dto';

describe('UsersService', () => {
  let service: UsersService;
  let userRepo: jest.Mocked<Repository<User>>;
  let progressRepo: jest.Mocked<Repository<StudyProgress>>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: '홍길동',
    passwordHash: 'hash',
    provider: null,
    providerId: null,
    profileImageUrl: null,
    birthday: '2000-01-01',
    studyStreakDays: 7,
    role: 'user' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockUserRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const mockProgressRepo = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(StudyProgress), useValue: mockProgressRepo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepo = module.get(getRepositoryToken(User));
    progressRepo = module.get(getRepositoryToken(StudyProgress));
  });

  describe('findById', () => {
    it('사용자가 존재하면 passwordHash 없이 반환', async () => {
      userRepo.findOne.mockResolvedValue(mockUser as User);
      const result = await service.findById('user-1');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe('test@example.com');
    });

    it('사용자가 없으면 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('사용자 정보 업데이트 후 반환', async () => {
      userRepo.update.mockResolvedValue({ affected: 1 } as any);
      userRepo.findOne.mockResolvedValue({
        ...mockUser,
        name: '새이름',
      } as User);

      const dto: UpdateUserDto = { name: '새이름' };
      const result = await service.update('user-1', dto);

      expect(userRepo.update).toHaveBeenCalledWith('user-1', dto);
      expect(result.name).toBe('새이름');
    });
  });

  describe('deleteUser', () => {
    it('사용자가 존재하면 삭제', async () => {
      userRepo.findOne.mockResolvedValue(mockUser as User);
      userRepo.remove.mockResolvedValue(mockUser as User);
      await service.deleteUser('user-1');
      expect(userRepo.remove).toHaveBeenCalled();
    });

    it('사용자가 없으면 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteUser('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('학습 통계를 반환', async () => {
      userRepo.findOne.mockResolvedValue(mockUser as User);
      progressRepo.find.mockResolvedValue([
        {
          userId: 'user-1',
          unitId: 'unit-1',
          progressPercent: 80,
          unit: {
            id: 'unit-1',
            unitNumber: 1,
            subject: { id: 'subj-1', slug: 'success', title: '성공적인 직업생활' },
          },
        },
        {
          userId: 'user-1',
          unitId: 'unit-2',
          progressPercent: 60,
          unit: {
            id: 'unit-2',
            unitNumber: 2,
            subject: { id: 'subj-1', slug: 'success', title: '성공적인 직업생활' },
          },
        },
      ] as any);

      const result = await service.getStats('user-1');
      expect(result).toHaveProperty('studyStreakDays', 7);
      expect(result).toHaveProperty('totalProgressPercent');
      expect(result.subjectStats).toHaveLength(1);
      expect(result.subjectStats[0].subjectSlug).toBe('success');
    });

    it('학습 기록이 없으면 0% 반환', async () => {
      userRepo.findOne.mockResolvedValue(mockUser as User);
      progressRepo.find.mockResolvedValue([]);

      const result = await service.getStats('user-1');
      expect(result.totalProgressPercent).toBe(0);
      expect(result.subjectStats).toHaveLength(0);
    });
  });
});
