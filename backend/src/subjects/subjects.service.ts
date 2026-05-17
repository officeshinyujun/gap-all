import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject } from '../entities/subject.entity';
import { Unit } from '../entities/unit.entity';

const SEED_DATA: {
  slug: string;
  title: string;
  units: { unitNumber: number; title: string }[];
}[] = [
  {
    slug: 'success',
    title: '성공적인 직업생활',
    units: [
      { unitNumber: 1, title: '일과 직업 및 직업 생활' },
      { unitNumber: 2, title: '생애 발달과 직업적 성공 (1)' },
      { unitNumber: 3, title: '생애 발달과 직업적 성공 (2)' },
      { unitNumber: 4, title: '기업의 종류와 형태별 특징' },
      { unitNumber: 5, title: '기업의 경영 활동' },
      { unitNumber: 6, title: '제조업과 제품 생산 활동' },
      { unitNumber: 7, title: '서비스업과 서비스 생산' },
      { unitNumber: 8, title: '직업 기초 능력의 종류와 향상' },
      { unitNumber: 9, title: '근로 계약과 근로자의 권리 보호' },
      { unitNumber: 10, title: '전공별 직무 수행 능력 탐색 (2)' },
      { unitNumber: 11, title: '경력 개발과 평생 학습의 의미' },
      { unitNumber: 12, title: '의사소통 능력' },
      { unitNumber: 13, title: '취업과 창업 및 기업가 정신 (2)' },
      { unitNumber: 14, title: '취업과 창업 및 기업가 정신 (3)' },
      { unitNumber: 15, title: '근로관계와 법 (1)' },
      { unitNumber: 16, title: '근로관계와 법 (2)' },
      { unitNumber: 17, title: '고용 서비스와 사회 제도' },
      { unitNumber: 18, title: '산업 안전과 재해 예방' },
      { unitNumber: 19, title: '협력적인 노사 관계' },
      {
        unitNumber: 20,
        title: '사회 문제와 직업 윤리 및 미래 사회와 직업 사회',
      },
    ],
  },
  {
    slug: 'industry',
    title: '공업 일반',
    units: [
      { unitNumber: 2, title: '경공업의 개요' },
      { unitNumber: 3, title: '중화학 공업의 개요' },
      { unitNumber: 4, title: '첨단 공업과 미래 사회' },
      { unitNumber: 5, title: '제품과 제조 과정' },
      { unitNumber: 6, title: '제품의 표준화' },
      { unitNumber: 7, title: '제품 개발 및 생산 관리' },
      { unitNumber: 8, title: '생산 혁신 활동과 생산 정보 시스템' },
      { unitNumber: 9, title: '공장 자동화와 로봇의 활용' },
      { unitNumber: 10, title: '구매·자재 관리' },
      { unitNumber: 11, title: '제조 현장 및 품질 관리' },
      { unitNumber: 12, title: '경영 지원 활동' },
      { unitNumber: 13, title: '기술 경영 및 창업' },
      { unitNumber: 14, title: '사고와 산업 안전' },
      { unitNumber: 15, title: '산업 안전의 종류와 예방 대책(1)' },
      { unitNumber: 16, title: '산업 안전의 종류와 예방 대책(2)' },
      { unitNumber: 17, title: '공해와 환경 오염' },
      { unitNumber: 18, title: '직업병과 자연환경 보전' },
      { unitNumber: 19, title: '직업 세계' },
      { unitNumber: 20, title: '진로 계획 수립과 실천' },
    ],
  },
];

@Injectable()
export class SubjectsService implements OnModuleInit {
  constructor(
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
  ) {}

  async onModuleInit() {
    await this.seed();
  }

  private async seed() {
    for (const data of SEED_DATA) {
      let subject = await this.subjectRepo.findOne({
        where: { slug: data.slug },
      });

      if (!subject) {
        subject = this.subjectRepo.create({
          slug: data.slug,
          title: data.title,
        });
        subject = await this.subjectRepo.save(subject);
      }

      for (const unitData of data.units) {
        const exists = await this.unitRepo.findOne({
          where: { subjectId: subject.id, unitNumber: unitData.unitNumber },
        });
        if (!exists) {
          const unit = this.unitRepo.create({
            subjectId: subject.id,
            unitNumber: unitData.unitNumber,
            title: unitData.title,
          });
          await this.unitRepo.save(unit);
        }
      }
    }
  }

  async findAll(): Promise<Subject[]> {
    return this.subjectRepo.find({
      order: { slug: 'ASC' },
    });
  }

  async findBySlug(slug: string): Promise<Subject & { units: Unit[] }> {
    const subject = await this.subjectRepo.findOne({
      where: { slug },
      relations: ['units'],
    });
    if (!subject) {
      throw new NotFoundException(`과목을 찾을 수 없습니다: ${slug}`);
    }
    subject.units.sort((a, b) => a.unitNumber - b.unitNumber);
    return subject;
  }

  async findUnitsBySlug(slug: string): Promise<Unit[]> {
    const subject = await this.subjectRepo.findOne({ where: { slug } });
    if (!subject) {
      throw new NotFoundException(`과목을 찾을 수 없습니다: ${slug}`);
    }
    return this.unitRepo.find({
      where: { subjectId: subject.id },
      order: { unitNumber: 'ASC' },
    });
  }

  async findSubjectById(id: string): Promise<Subject> {
    const subject = await this.subjectRepo.findOne({ where: { id } });
    if (!subject) {
      throw new NotFoundException(`과목을 찾을 수 없습니다: ${id}`);
    }
    return subject;
  }
}
