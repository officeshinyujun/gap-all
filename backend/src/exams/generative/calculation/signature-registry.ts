/**
 * 단원 특징 문항 모듈 등록부.
 *
 * 플래너가 슬롯의 응답 형식에 맞는 모듈을 단원별 비율로 고른다.
 *  - truth_combination → statements: 서버 계산 진술을 <보기> 참 1개·거짓 1개에 넣는다.
 *  - statement(옳은/옳지 않은) → choices: 정답 선지와 오답 선지 하나를 서버 계산 진술로 확정한다.
 *  - statement(옳은 것) → numeric: 발문과 오름차순 수치 선지 5개를 서버가 확정한다(공업 일반 기출 형식).
 * 비율은 실제 기출 비중보다 높게 잡았다(계산 문항 중점 요청).
 */

import type { GenerativePolarity, GenerativeResponseMode, GenerativeSubject, UnitConcept, UnitStyleGuide } from '../generative.types';
import { scenarioToPlan, type PlanContext, type Rng } from './calculation-kit';
import type { CalculationFormat, CalculationKind, CalculationPlan, CalculationScenario } from './calculation.types';
import { benefitScenario } from './employment-insurance-calculation';
import { abcScenario, partsScenario } from './inventory-calculation';
import { laborScenario } from './labor-calculation';
import { dismissalScenario, nightWorkScenario } from './labor-rights-calculation';
import { processScenario } from './process-calculation';
import { paretoScenario, sixSigmaScenario } from './quality-calculation';
import { accidentScenario } from './safety-calculation';

type FormatShares = Readonly<Partial<Record<CalculationFormat, number>>>;

export type SignatureModule = Readonly<{
  kind: CalculationKind;
  subject: GenerativeSubject;
  /** 단원 → 형식별로 해당 슬롯을 이 모듈로 바꿀 확률 */
  shares: Readonly<Record<number, FormatShares>>;
  /** choices·numeric 형식에서 정답 개념으로 우선 쓸 단원 개념 이름의 낱말 */
  conceptKeywords: readonly string[];
  /**
   * statements 형식에서 정답 개념을 고를 후보(단원 개념 이름의 낱말). 서버 계산 진술이 <보기> 절반 이상을
   * 차지하므로, 무관한 개념(예: 근로관계법의 종류)이 정답 개념으로 붙지 않게 한다. 없으면 conceptKeywords.
   */
  statementConceptKeywords?: readonly string[];
  build: (rng: Rng) => CalculationScenario;
}>;

export const SIGNATURE_MODULES: readonly SignatureModule[] = [
  {
    kind: 'critical_path',
    subject: 'kongil',
    shares: { 7: { statements: 0.3, numeric: 0.3, choices: 0.1 } },
    conceptKeywords: ['퍼트'],
    build: processScenario,
  },
  {
    kind: 'parts_stock',
    subject: 'kongil',
    shares: {
      7: { statements: 0.2, numeric: 0.15, choices: 0.1 },
      10: { statements: 0.2, numeric: 0.15, choices: 0.1 },
    },
    conceptKeywords: ['자재 소요', '구매 관리'],
    build: partsScenario,
  },
  {
    kind: 'abc_inventory',
    subject: 'kongil',
    shares: { 10: { statements: 0.25, numeric: 0.15, choices: 0.15 } },
    conceptKeywords: ['ABC'],
    build: abcScenario,
  },
  {
    kind: 'six_sigma',
    subject: 'kongil',
    shares: {
      8: { statements: 0.35, numeric: 0.25, choices: 0.2 },
      11: { statements: 0.15, numeric: 0.1, choices: 0.1 },
    },
    conceptKeywords: ['6시그마'],
    build: sixSigmaScenario,
  },
  {
    kind: 'pareto_defect',
    subject: 'kongil',
    shares: { 11: { statements: 0.3, numeric: 0.25, choices: 0.15 } },
    conceptKeywords: ['파레토'],
    build: paretoScenario,
  },
  {
    kind: 'industrial_accident',
    subject: 'kongil',
    shares: { 14: { statements: 0.35, numeric: 0.25, choices: 0.2 } },
    conceptKeywords: ['중대 재해', '재해율'],
    build: accidentScenario,
  },
  {
    kind: 'labor',
    subject: 'success',
    shares: { 15: { statements: 0.5, choices: 0.25 }, 16: { statements: 0.1, choices: 0.05 } },
    conceptKeywords: [],
    statementConceptKeywords: ['근로시간', '주휴', '연차', '퇴직금', '5명 미만'],
    build: laborScenario,
  },
  {
    kind: 'dismissal_remedy',
    subject: 'success',
    shares: { 16: { statements: 0.25, choices: 0.2 } },
    conceptKeywords: ['부당 해고'],
    statementConceptKeywords: ['해고'],
    build: dismissalScenario,
  },
  {
    kind: 'night_work',
    subject: 'success',
    shares: { 16: { statements: 0.15, choices: 0.15 } },
    conceptKeywords: [],
    statementConceptKeywords: ['야간', '연장', '연소', '미성년자'],
    build: nightWorkScenario,
  },
  {
    kind: 'job_seeking_benefit',
    subject: 'success',
    shares: { 17: { statements: 0.45, choices: 0.3 } },
    conceptKeywords: ['소정급여일수', '구직급여'],
    statementConceptKeywords: ['소정급여일수', '구직급여', '취업촉진'],
    build: benefitScenario,
  },
];

export type SignatureChoice = Readonly<{ module: SignatureModule; format: CalculationFormat }>;

export function formatsForSlot(mode: GenerativeResponseMode, polarity: GenerativePolarity): CalculationFormat[] {
  if (mode === 'truth_combination') return ['statements'];
  if (mode === 'statement') return polarity === 'positive' ? ['numeric', 'choices'] : ['choices'];
  return [];
}

/** 슬롯 하나를 특징 문항으로 바꿀지 정한다(비율 합만큼의 확률). */
export function chooseSignature(
  subject: GenerativeSubject,
  unitNumber: number,
  mode: GenerativeResponseMode,
  polarity: GenerativePolarity,
  rng: Rng,
  modules: readonly SignatureModule[] = SIGNATURE_MODULES,
  /** 비율 배수(상 난이도 시험은 특징 문항을 더 많이). 합은 0.9를 넘지 않는다. */
  shareScale = 1,
): SignatureChoice | undefined {
  const formats = formatsForSlot(mode, polarity);
  const roll = rng();
  let accumulated = 0;
  for (const module of modules) {
    if (module.subject !== subject) continue;
    for (const format of formats) {
      accumulated = Math.min(0.9, accumulated + (module.shares[unitNumber]?.[format] ?? 0) * shareScale);
      if (roll < accumulated) return { module, format };
    }
  }
  return undefined;
}

export function buildSignaturePlan(choice: SignatureChoice, rng: Rng, context: PlanContext): CalculationPlan | undefined {
  return scenarioToPlan(choice.module.build(rng), choice.format, rng, context);
}

/** statements 형식: 계산 진술과 맞는 단원 개념 후보(없으면 빈 배열 → 제한 없음) */
export function signatureStatementConcepts(guide: UnitStyleGuide, choice: SignatureChoice | undefined): UnitConcept[] {
  if (choice === undefined || choice.format !== 'statements') return [];
  const keywords = choice.module.statementConceptKeywords ?? choice.module.conceptKeywords;
  return guide.concepts.filter((concept) => keywords.some((keyword) => concept.name.includes(keyword)));
}

/** 선지형·수치형은 계산 진술이 곧 정답이므로 정답 개념도 그 계산 개념으로 맞춘다. */
export function signatureConcept(guide: UnitStyleGuide, choice: SignatureChoice | undefined): UnitConcept | undefined {
  if (choice === undefined || choice.format === 'statements') return undefined;
  for (const keyword of choice.module.conceptKeywords) {
    const concept = guide.concepts.find((entry) => entry.name.includes(keyword));
    if (concept !== undefined) return concept;
  }
  return undefined;
}
