import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  ConfusionPair,
  GenerativeSubject,
  LengthBand,
  MaterialGenre,
  UnitConcept,
  UnitStyleGuide,
} from './generative.types';

/**
 * 완전 AI 생성의 지식 기반.
 * - exam-style-profile.json: v3 기출 940문항 정량 통계 (scripts/extract-exam-style-profile.py)
 * - unit-guides/{subject}_{NN}.json: 단원별 출제 DNA (개념·혼동 쌍·자료 장르·참/거짓 진술 기법 등)
 * 런타임에 참조 문항을 읽지 않는다. 둘 다 원문을 일반화한 특징만 담는다.
 */
const DATA_DIR = join(__dirname, 'data');

type Distribution = Readonly<Record<string, number>>;

export type ProfileStats = Readonly<{
  count: number;
  responseModes: Distribution;
  negativeShareOfSingle: number;
  stemEndings: Distribution;
  stemOpenings: Distribution;
  stemShellsByMode: Readonly<Record<string, readonly string[]>>;
  conditionClauseShare: number;
  viewItemCounts: Distribution;
  comboChoiceSets: Readonly<Record<string, Distribution>>;
  answerPositions: Distribution;
  points: Distribution;
  textualShapes: Distribution;
  /** 전체 문항 중 엔진이 그릴 수 있는 그림형 구성(chart+text·chart·scene+dialogue)의 비율 */
  figureShapes?: Distribution;
  /** 전체 문항 중 그림 종류(categorical·gantt·…·flow·network·…·scene)별 비율 */
  figureTypes?: Distribution;
  labels: Distribution;
  dialogueSpeakers: Distribution;
  choiceTableHeaders: Distribution;
  lengths: Readonly<{
    stem: LengthBand;
    stimulus: LengthBand;
    viewItem: LengthBand;
    choiceByMode: Readonly<Record<string, LengthBand>>;
    explanation: LengthBand;
  }>;
  primaryConcepts: Readonly<Record<string, number>>;
}>;

export type SubjectProfile = Readonly<{
  overall: ProfileStats;
  bySource: Readonly<{ moi: ProfileStats; suteck: ProfileStats }>;
  units: Readonly<Record<string, ProfileStats & Readonly<{ difficulty?: UnitDifficulty }>>>;
}>;

/** 기출(모의평가·수능) 배점·문항 위치·계산 비율로 매긴 단원 난도. 정답률 자료는 없다. */
export type UnitDifficulty = Readonly<{
  moiCount: number;
  /** 표본이 적으면 과목 평균 쪽으로 보정한 3점 비율 */
  points3Share: number;
  rawPoints3Share: number | null;
  meanQuestionNumber: number;
  calculationShare: number;
  index: number;
  tier: 'easy' | 'standard' | 'hard';
}>;

const DEFAULT_UNIT_DIFFICULTY: UnitDifficulty = {
  moiCount: 0,
  points3Share: 0.5,
  rawPoints3Share: null,
  meanQuestionNumber: 10.5,
  calculationShare: 0.1,
  index: 0.45,
  tier: 'standard',
};

export function loadUnitDifficulty(subject: GenerativeSubject, unitNumber: number): UnitDifficulty {
  return loadExamStyleProfile().subjects[subject]?.units[String(unitNumber)]?.difficulty ?? DEFAULT_UNIT_DIFFICULTY;
}

export type ExamStyleProfile = Readonly<{
  version: string;
  corpus: string;
  questionCount: number;
  subjects: Readonly<Record<GenerativeSubject, SubjectProfile>>;
}>;

let cachedProfile: ExamStyleProfile | null = null;
const cachedGuides = new Map<string, UnitStyleGuide>();

export function generativeSubjectFromSlug(slug: string): GenerativeSubject {
  if (slug === 'success' || slug === 'sungjik') return 'success';
  if (slug === 'industry' || slug === 'kongil') return 'kongil';
  throw new Error(`완전 AI 생성을 지원하지 않는 과목입니다: ${slug}`);
}

export function loadExamStyleProfile(): ExamStyleProfile {
  if (cachedProfile === null) {
    cachedProfile = JSON.parse(
      readFileSync(join(DATA_DIR, 'exam-style-profile.json'), 'utf8'),
    ) as ExamStyleProfile;
  }
  return cachedProfile;
}

export function unitGuidePath(subject: GenerativeSubject, unitNumber: number): string {
  return join(
    DATA_DIR,
    'unit-guides',
    `${subject}_${String(unitNumber).padStart(2, '0')}.json`,
  );
}

export function hasUnitGuide(subject: GenerativeSubject, unitNumber: number): boolean {
  return existsSync(unitGuidePath(subject, unitNumber));
}

export function loadUnitGuide(
  subject: GenerativeSubject,
  unitNumber: number,
): UnitStyleGuide {
  const key = `${subject}:${unitNumber}`;
  const cached = cachedGuides.get(key);
  if (cached !== undefined) return cached;
  const path = unitGuidePath(subject, unitNumber);
  const guide = existsSync(path)
    ? normalizeUnitGuide(JSON.parse(readFileSync(path, 'utf8')), subject, unitNumber)
    : fallbackUnitGuide(subject, unitNumber);
  cachedGuides.set(key, guide);
  return guide;
}

/** 에이전트/사람이 작성한 JSON을 방어적으로 정규화한다. 빠진 필드는 빈 값으로. */
export function normalizeUnitGuide(
  raw: unknown,
  subject: GenerativeSubject,
  unitNumber: number,
): UnitStyleGuide {
  const value = isRecord(raw) ? raw : {};
  const statementCraft = isRecord(value.statementCraft) ? value.statementCraft : {};
  const responseFormats = isRecord(value.responseFormats) ? value.responseFormats : {};
  const concepts = arrayOf(value.concepts, normalizeConcept);
  const fallback = concepts.length === 0 ? fallbackUnitGuide(subject, unitNumber) : null;
  return {
    subject,
    unitNumber,
    unitTitle: text(value.unitTitle) || `${unitNumber}단원`,
    examFocus: text(value.examFocus),
    concepts: fallback?.concepts ?? concepts,
    confusionPairs: arrayOf(value.confusionPairs, normalizeConfusionPair),
    materialGenres: normalizeGenres(arrayOf(value.materialGenres, normalizeGenre)),
    scenarioArchetypes: texts(value.scenarioArchetypes),
    trueStatementPatterns: texts(statementCraft.trueStatementPatterns),
    falseStatementTechniques: texts(statementCraft.falseStatementTechniques),
    responseFormats: Object.fromEntries(
      Object.entries(responseFormats)
        .map(([formatKey, description]) => [formatKey, text(description)])
        .filter(([, description]) => description !== ''),
    ),
    stemVariants: texts(value.stemVariants),
    numericConventions: text(value.numericConventions),
    toneAndRegister: text(value.toneAndRegister),
    difficultyLevers: texts(value.difficultyLevers),
    pitfallsToAvoid: texts(value.pitfallsToAvoid),
  };
}

/** 단원 가이드가 없을 때: 정량 프로필의 개념 빈도만으로 최소 가이드를 만든다. */
export function fallbackUnitGuide(
  subject: GenerativeSubject,
  unitNumber: number,
): UnitStyleGuide {
  const stats = loadExamStyleProfile().subjects[subject]?.units[String(unitNumber)];
  const concepts: UnitConcept[] = Object.entries(stats?.primaryConcepts ?? {}).map(
    ([name, count]) => ({
      name,
      definition: '',
      keyFacts: [],
      diagnosticCues: [],
      confusableWith: [],
      weight: Math.min(5, Math.max(1, count)),
    }),
  );
  return {
    subject,
    unitNumber,
    unitTitle: `${unitNumber}단원`,
    examFocus: '',
    concepts,
    confusionPairs: [],
    materialGenres: normalizeGenres([]),
    scenarioArchetypes: [],
    trueStatementPatterns: [],
    falseStatementTechniques: [],
    responseFormats: {},
    stemVariants: [],
    numericConventions: '',
    toneAndRegister: '',
    difficultyLevers: [],
    pitfallsToAvoid: [],
  };
}

/** 거짓 진술 기법 공통 목록. 단원 가이드에 없을 때 쓰는 기출 공통 패턴. */
export const COMMON_FALSE_TECHNIQUES: readonly string[] = [
  '개념 바꿔치기: 제시문 단서가 가리키는 개념 대신 같은 단원 혼동 개념의 이름·특징을 붙인다',
  '조건·방향 반전: 증가/감소, 높다/낮다, 전/후, 필수/선택 등 판별 기준의 방향을 뒤집는다',
  '주체 뒤바꿈: A가 한 일을 B가 한 것으로, 근로자 의무를 사용자 의무로 바꾼다',
  '과잉 일반화: "항상", "모든", "반드시"로 예외가 있는 개념을 단정한다',
  '범주 오분류: 하위 개념을 다른 상위 분류에 넣는다',
  '순서·단계 오류: 절차의 단계 순서나 단계에 속한 활동을 어긋나게 연결한다',
  '근거 없는 추론: 제시문에서 알 수 없는 내용을 사실처럼 단정한다',
];

/** 실제 기출에서 관찰된 문항 제작 원리(문항 단위 공통 규칙). */
export const EXAM_CRAFT_RULES: readonly string[] = [
  '발문-<보기>-선지는 하나의 판단 체계다: 발문이 판단 축을 정하고, 각 진술의 참/거짓은 제시문 단서 + 교과 개념으로만 결정되며, 선지는 그 결과를 부호화한다.',
  '정답 개념의 이름을 제시문에 직접 쓰지 않는다. 제시문은 일상·현장 언어로 상황을 보여 주고, 판단은 교과 개념어로 하게 만든다.',
  '단서는 제시문 전체에 분산한다. 한 문장만 읽고 풀리지 않게 하되, 정답 판정에 필요한 단서는 반드시 제시문 안에 있어야 한다.',
  '<보기>와 선지 진술은 "제시문 대상 + 교과 개념/특징" 구조의 완결된 평서문으로 쓴다. 기출 끝맺음은 "…한다"(30%), "…있다"(20%), "…이다"(14%), "…하였다"(8%) 순이다.',
  '오답은 무관한 내용이 아니라 같은 단원의 유사 개념을 비틀어 만든다. 거짓 진술 하나에는 오류 하나만 넣는다.',
  '정답 선지만 유독 길거나 구체적이면 안 된다. 선지끼리 길이·문형·어휘 수준을 맞춘다.',
  '"모두 옳다", "알 수 없다", "정답 없음" 같은 선지와 이중 부정은 쓰지 않는다.',
  '가상의 기업·인물은 ○○ 기업, A 씨, 학생 A·B, 교사, 갑·을 같은 기출 관례로 표기하고, 실존 기업명·실존 인물·출처가 불분명한 통계는 쓰지 않는다.',
  '교과서(고등학교 직업 계열 교과) 범위를 벗어난 개념·최신 개정 사항·논쟁적 해석은 출제하지 않는다. 법정 수치는 교과서에 있는 값만 쓴다.',
  '제시문 표의 수치·조건은 서로 모순되지 않아야 하며, 계산이 필요하면 한 단계로 검산 가능해야 한다.',
];

function normalizeConcept(value: unknown): UnitConcept | null {
  if (!isRecord(value) || text(value.name) === '') return null;
  const weight = Number(value.weight);
  return {
    name: text(value.name),
    definition: text(value.definition),
    keyFacts: texts(value.keyFacts),
    diagnosticCues: texts(value.diagnosticCues),
    confusableWith: texts(value.confusableWith),
    weight: Number.isFinite(weight) ? Math.min(5, Math.max(1, weight)) : 1,
  };
}

function normalizeConfusionPair(value: unknown): ConfusionPair | null {
  if (!isRecord(value) || text(value.a) === '' || text(value.b) === '') return null;
  return { a: text(value.a), b: text(value.b), boundary: text(value.boundary) };
}

function normalizeGenre(value: unknown): MaterialGenre | null {
  if (!isRecord(value) || text(value.genre) === '') return null;
  const share = Number(value.share);
  return {
    genre: text(value.genre),
    blockShape: text(value.blockShape) || 'text',
    construction: text(value.construction),
    labelling: text(value.labelling),
    share: Number.isFinite(share) && share > 0 ? share : 0.1,
  };
}

function normalizeGenres(genres: readonly MaterialGenre[]): readonly MaterialGenre[] {
  if (genres.length > 0) return genres;
  return [
    { genre: '사례', blockShape: 'text', construction: '인물·기업 상황을 서술', labelling: 'A 씨, ○○ 기업', share: 0.5 },
    { genre: '보고서', blockShape: 'table+text', construction: '도입 문단 + 구분/내용 표', labelling: '(가), (나)', share: 0.3 },
    { genre: '대화', blockShape: 'dialogue', construction: '교사-학생 또는 상담 대화', labelling: '교사, 학생 A·B', share: 0.2 },
  ];
}

function arrayOf<T>(value: unknown, normalize: (item: unknown) => T | null): T[] {
  return Array.isArray(value)
    ? value.map(normalize).filter((item): item is T => item !== null)
    : [];
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((item) => item !== '') : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
