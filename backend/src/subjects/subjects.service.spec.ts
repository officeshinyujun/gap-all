import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SubjectsService } from './subjects.service';
import { Subject } from '../entities/subject.entity';
import { Unit } from '../entities/unit.entity';

describe('SubjectsService', () => {
  let service: SubjectsService;
  let subjectRepo: jest.Mocked<Repository<Subject>>;
  let unitRepo: jest.Mocked<Repository<Unit>>;

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

  beforeEach(async () => {
    const mockSubjectRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const mockUnitRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubjectsService,
        { provide: getRepositoryToken(Subject), useValue: mockSubjectRepo },
        { provide: getRepositoryToken(Unit), useValue: mockUnitRepo },
      ],
    })
      .overrideProvider(SubjectsService)
      .useFactory({
        provide: SubjectsService,
        useFactory: (_subjectRepo: Repository<Subject>, _unitRepo: Repository<Unit>) => {
          const svc = new SubjectsService(_subjectRepo, _unitRepo);
          // override onModuleInit seed to avoid DB calls
          (svc as any).onModuleInit = jest.fn();
          return svc;
        },
        inject: [getRepositoryToken(Subject), getRepositoryToken(Unit)],
      })
      .compile();

    service = module.get<SubjectsService>(SubjectsService);
    subjectRepo = module.get(getRepositoryToken(Subject));
    unitRepo = module.get(getRepositoryToken(Unit));
  });

  describe('findAll', () => {
    it('모든 과목 목록 반환', async () => {
      subjectRepo.find.mockResolvedValue([mockSubject]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('success');
    });
  });

  describe('findBySlug', () => {
    it('과목과 소속 단원 목록 반환', async () => {
      subjectRepo.findOne.mockResolvedValue({
        ...mockSubject,
        units: [mockUnit],
      } as any);
      const result = await service.findBySlug('success');
      expect(result.slug).toBe('success');
      expect(result.units).toHaveLength(1);
    });

    it('없는 과목이면 NotFoundException', async () => {
      subjectRepo.findOne.mockResolvedValue(null);
      await expect(service.findBySlug('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findUnitsBySlug', () => {
    it('과목의 모든 단원을 반환', async () => {
      subjectRepo.findOne.mockResolvedValue(mockSubject);
      unitRepo.find.mockResolvedValue([mockUnit]);

      const result = await service.findUnitsBySlug('success');
      expect(result).toHaveLength(1);
      expect(result[0].unitNumber).toBe(1);
    });

    it('과목이 없으면 NotFoundException', async () => {
      subjectRepo.findOne.mockResolvedValue(null);
      await expect(service.findUnitsBySlug('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findSubjectById', () => {
    it('ID로 과목 조회', async () => {
      subjectRepo.findOne.mockResolvedValue(mockSubject);
      const result = await service.findSubjectById('subj-1');
      expect(result.slug).toBe('success');
    });

    it('없는 ID면 NotFoundException', async () => {
      subjectRepo.findOne.mockResolvedValue(null);
      await expect(service.findSubjectById('none')).rejects.toThrow(NotFoundException);
    });
  });
});
