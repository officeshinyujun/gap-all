import type { StudyExamPattern, StudyMustKnowBlock } from './study-insights';
import { STUDY_MUST_KNOW_SUCCESS_1_10_SEEDS } from './study-must-know-success-1-10';
import { STUDY_MUST_KNOW_SEEDS_11_20 } from './study-must-know-success-11-20';
import { STUDY_MUST_KNOW_INDUSTRY_1_10_SEEDS } from './study-must-know-industry-1-10';
import { STUDY_MUST_KNOW_INDUSTRY_11_20_SEEDS } from './study-must-know-industry-11-20';

type StudyMustKnowSeed = Readonly<{
  subjectSlug: 'success' | 'industry';
  unitNumber: number;
  id: string;
  conceptAliases: readonly string[];
  title: string;
  type: StudyMustKnowBlock['type'];
  summary?: string;
  headers?: readonly string[];
  rows?: readonly (readonly string[])[];
  mustRemember: readonly string[];
  commonTraps: readonly string[];
  patternAliases: readonly string[];
  reviewStatus?: 'verified' | 'textbook_only';
}>;

const STUDY_MUST_KNOW_SEEDS: readonly StudyMustKnowSeed[] = [
  {
    subjectSlug: 'success',
    unitNumber: 4,
    id: 'success-4-company-types',
    conceptAliases: ['기업 형태', '회사 형태', '기업의 형태', '경제 주체로서의 기업'],
    title: '기업 형태별 핵심 비교',
    type: 'comparison',
    headers: ['구분', '합명회사', '합자회사', '유한회사', '주식회사'],
    rows: [
      ['구성', '무한책임사원', '무한+유한책임사원', '유한책임사원', '주주'],
      ['책임', '전원 무한책임', '사원별 책임 다름', '출자 범위', '주주 유한책임'],
      ['경영', '사원 중심', '무한책임사원 중심', '사원총회·이사', '이사회·대표이사'],
      ['자본 조달', '주식 발행 불가', '주식 발행 불가', '주식 발행 불가', '주식 발행 가능'],
      ['성격', '인적 회사', '인적·물적 혼합', '물적 회사 성격', '대표적 물적 회사'],
    ],
    mustRemember: [
      '합명회사는 무한책임사원만으로 구성된다.',
      '합자회사는 무한책임사원과 유한책임사원으로 구성된다.',
      '합자회사의 유한책임사원은 원칙적으로 업무 집행에 참여하지 않는다.',
      '주식회사는 주식 발행, 주주 유한책임, 소유와 경영의 분리가 핵심이다.',
    ],
    commonTraps: [
      '합자회사를 모든 사원이 무한책임인 회사로 착각하지 않는다.',
      '유한회사와 주식회사를 모두 주식 발행 회사로 보지 않는다.',
    ],
    patternAliases: ['기업 형태', '기업 형태별 특징', '사회적 책임'],
  },
  {
    subjectSlug: 'success',
    unitNumber: 4,
    id: 'success-4-economic-actors',
    conceptAliases: ['경제 주체', '기업의 역할'],
    title: '경제 주체별 역할',
    type: 'comparison',
    headers: ['구분', '가계', '기업', '정부'],
    rows: [
      ['주요 역할', '소비·생산 요소 제공', '재화·서비스 생산', '공공 서비스·정책 수행'],
      ['주요 수입·재원', '임금·이자·지대·이윤', '판매 수입·이윤', '조세·공공 수입'],
      ['대표 판단 기준', '효용 극대화', '이윤 극대화', '공공성·사회 후생'],
    ],
    mustRemember: [
      '가계는 소비 주체이면서 생산 요소를 제공한다.',
      '기업은 재화와 서비스를 생산하고 공급한다.',
      '정부는 공공재를 제공하고 경제 활동을 조정한다.',
    ],
    commonTraps: ['정부를 이윤 극대화를 추구하는 민간 경제 주체로 보지 않는다.'],
    patternAliases: ['경제 주체', '기업의 역할'],
  },
  {
    subjectSlug: 'industry',
    unitNumber: 1,
    id: 'industry-1-location-types',
    conceptAliases: ['공업 입지', '입지 지향성', '공업의 입지'],
    title: '공업 입지 유형별 판단 기준',
    type: 'comparison',
    headers: ['유형', '가까운 곳', '판단 단서'],
    rows: [
      ['원료 지향형', '원료 산지', '원료 운송비가 크거나 원료가 중량을 많이 차지함'],
      ['시장 지향형', '시장', '제품 운송비·부패·수요 대응이 중요함'],
      ['노동 지향형', '노동력이 풍부한 지역', '노동력 확보와 인건비가 중요함'],
      ['적환지 지향형', '항만·철도·교통 결절점', '운송 수단을 바꾸거나 대량 운송함'],
    ],
    mustRemember: [
      '입지 유형은 생산품과 원료의 무게·부피 변화, 운송비를 함께 본다.',
      '시장 지향형은 소비지와의 거리 및 제품 운송 조건을 확인한다.',
    ],
    commonTraps: ['원료 지향형과 시장 지향형을 생산품의 이름만 보고 판단하지 않는다.'],
    patternAliases: ['공업 입지', '입지 지향성'],
  },
  ...STUDY_MUST_KNOW_SUCCESS_1_10_SEEDS,
  ...STUDY_MUST_KNOW_SEEDS_11_20,
  ...STUDY_MUST_KNOW_INDUSTRY_1_10_SEEDS,
  ...STUDY_MUST_KNOW_INDUSTRY_11_20_SEEDS,
];

export function buildStudyMustKnowBlocks(
  subjectSlug: 'success' | 'industry',
  unitNumber: number,
  patterns: readonly StudyExamPattern[],
): readonly StudyMustKnowBlock[] {
  const blocks: StudyMustKnowBlock[] = [];
  for (const seed of STUDY_MUST_KNOW_SEEDS
    .filter((seed) => seed.subjectSlug === subjectSlug && seed.unitNumber === unitNumber)
  ) {
    const matchedPatterns = patterns.filter((pattern) =>
      seed.patternAliases.some((alias) =>
        pattern.title.includes(alias) || alias.includes(pattern.title),
      ),
    );
    const referenceQuestionIds = unique(
      matchedPatterns.flatMap((pattern) => pattern.referenceQuestionIds),
    );
    if (referenceQuestionIds.length === 0) continue;
    blocks.push({
        id: seed.id,
        conceptAliases: seed.conceptAliases,
        title: seed.title,
        type: seed.type,
        ...(seed.summary === undefined ? {} : { summary: seed.summary }),
        ...(seed.headers === undefined ? {} : { headers: seed.headers }),
        ...(seed.rows === undefined ? {} : { rows: seed.rows }),
        mustRemember: seed.mustRemember,
        commonTraps: seed.commonTraps,
        referenceQuestionIds,
        confidence: referenceQuestionIds.length >= 2 ? ('high' as const) : ('related' as const),
        reviewStatus: seed.reviewStatus ?? 'verified',
      });
  }
  return blocks;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
