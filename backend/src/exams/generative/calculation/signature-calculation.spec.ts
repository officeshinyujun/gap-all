import { Difficulty } from '../../../entities/difficulty';
import { applyCalculationPlan, assembleGenerativeQuestion, duplicateCheckText, parseGenerativeCandidate, validateGenerativeCandidate } from '../generative-item-assembler';
import { planGenerativeExam, seededRandom } from '../generative-item-planner';
import type { GenerativeItemSpec } from '../generative.types';
import { formatValue, josa, placeNumericChoices, scenarioToPlan } from './calculation-kit';
import { benefitScenario, prescribedBenefitDays } from './employment-insurance-calculation';
import { reorderDay } from './inventory-calculation';
import { dismissalScenario, generateDismissalFacts, nightWorkDerived } from './labor-rights-calculation';
import { processPaths, scheduleProcess } from './process-calculation';
import { ppm, sixSigmaAllowance } from './quality-calculation';
import { isSeriousAccident } from './safety-calculation';
import { SIGNATURE_MODULES, chooseSignature } from './signature-registry';

describe('signature calculation kit', () => {
  it('places ascending numeric choices with the answer at the planned position', () => {
    for (let answerIndex = 1; answerIndex <= 5; answerIndex += 1) {
      const values = placeNumericChoices(22, [14, 20, 21, 27], answerIndex, 1, 1, seededRandom(`n${answerIndex}`));
      expect(values).toHaveLength(5);
      expect(values?.[answerIndex - 1]).toBe(22);
      expect([...(values ?? [])].sort((a, b) => a - b)).toEqual(values);
      expect(new Set(values).size).toBe(5);
    }
    // 정답 아래에 4개를 둘 수 없으면 만들지 않는다.
    expect(placeNumericChoices(2, [], 5, 1, 1, seededRandom('x'))).toBeUndefined();
  });

  it('attaches particles by the final consonant', () => {
    expect(josa('가정용 드론', '을/를')).toBe('가정용 드론을');
    expect(josa('캠핑 의자', '을/를')).toBe('캠핑 의자를');
    expect(josa('최대 개수', '으로/로')).toBe('최대 개수로');
    expect(josa('최소 시간', '으로/로')).toBe('최소 시간으로');
    expect(josa('사고 1', '은/는')).toBe('사고 1은');
    expect(josa('TV', '은/는')).toBe('TV는');
    expect(formatValue(54_400, '원')).toBe('54,400원');
    expect(formatValue(40, ' PPM')).toBe('40 PPM');
  });
});

describe('unit signature rules reproduce real exam answers', () => {
  it('공업 일반 7단원: 가장 긴 경로 (2022 9월 20번, 2025 9월 20번)', () => {
    const s2 = { A: [], B: ['A'], C: ['A'], D: ['B', 'C'], E: ['B', 'D'] } as const;
    expect(scheduleProcess(s2, { A: 6, B: 4, C: 5, D: 7, E: 4 }).total).toBe(22);
    expect(processPaths(s2, { A: 6, B: 4, C: 5, D: 7, E: 4 }).map((path) => path.sum).sort()).toEqual([14, 21, 22]);
    const s3 = { A: [], B: [], C: ['A', 'B'], D: ['A', 'B'], E: ['C', 'D'] } as const;
    expect(scheduleProcess(s3, { A: 4, B: 6, C: 20, D: 14, E: 4 }).total).toBe(30);
    expect(scheduleProcess(s3, { A: 4, B: 6, C: 10, D: 14, E: 4 }).total).toBe(24);
  });

  it('공업 일반 7단원: 주문 시점 (수능특강 캠핑 의자 6일째)', () => {
    expect(reorderDay(640, 50 * 2, 50)).toBe(6);
  });

  it('공업 일반 8·11단원: 6시그마 허용 불량과 PPM (2025 수능 11번, 2024 9월 20번)', () => {
    expect(30 - sixSigmaAllowance(2_000_000)).toBe(24);
    expect([1, 3, 4].map((millions) => sixSigmaAllowance(millions * 1_000_000))).toEqual([3, 10, 13]);
    expect(ppm(120, 3_000_000)).toBe(40);
    expect(ppm(14, 2_000_000)).toBe(7);
  });

  it('공업 일반 14단원: 중대 재해 경계', () => {
    expect(isSeriousAccident({ deaths: 1, injured: 0, careMonths: 0 })).toBe(true);
    expect(isSeriousAccident({ deaths: 0, injured: 1, careMonths: 6 })).toBe(false);
    expect(isSeriousAccident({ deaths: 0, injured: 2, careMonths: 2 })).toBe(false);
    expect(isSeriousAccident({ deaths: 0, injured: 3, careMonths: 4 })).toBe(true);
    expect(isSeriousAccident({ deaths: 0, injured: 10, careMonths: 0.25 })).toBe(true);
  });

  it('성직 16단원: 야간 근로 시간 (2023 수능 9번 0시~8시 → 6시간)', () => {
    const d = nightWorkDerived({ workplace: '○○편의점', size: 2, wage: 10_000, startMinutes: 24 * 60, workHours: 8, breakMinutes: 0, breakStart: 28 * 60 });
    expect(d.nightHours).toBe(6);
    expect(d.premium).toBe(0);
  });

  it('성직 17단원: 소정급여일수 (2023 6월 15번, 2023 수능 14번, 2024 수능 15번)', () => {
    expect(prescribedBenefitDays(45, 13 * 12)).toBe(240);
    expect(prescribedBenefitDays(55, 9 * 12)).toBe(240);
    expect(prescribedBenefitDays(52, 7 * 12 + 5)).toBe(240);
    expect(prescribedBenefitDays(24, 18)).toBe(150);
  });

  it('성직 16단원: 상담일은 구제 신청 기한에서 2주 이상 떨어진다', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const facts = generateDismissalFacts(seededRandom(`dismissal-${seed}`));
      const deadline = Date.UTC(facts.dismissed.year, facts.dismissed.month - 1 + 3, facts.dismissed.day);
      const consulted = Date.UTC(facts.consulted.year, facts.consulted.month - 1, facts.consulted.day);
      expect(Math.abs(deadline - consulted) / 86_400_000).toBeGreaterThanOrEqual(14);
    }
    expect(Object.keys(dismissalScenario(seededRandom('d')).templates).length).toBeGreaterThanOrEqual(2);
  });

  it('성직 16단원: 해고 예고는 당일 통보(수당 대상)이거나 30일 넘게 앞선 통보뿐이고, 판단 기준을 [조건]으로 고정한다', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const facts = generateDismissalFacts(seededRandom(`dismissal-${seed}`));
      const gap = (Date.UTC(facts.dismissed.year, facts.dismissed.month - 1, facts.dismissed.day)
        - Date.UTC(facts.noticed.year, facts.noticed.month - 1, facts.noticed.day)) / 86_400_000;
      // 일부 예고(1~29일)는 "부족한 일수분만 지급" 해석과 다툼이 생기므로 만들지 않는다.
      expect(gap === 0 || gap > 30).toBe(true);
      const scenario = dismissalScenario(seededRandom(`dismissal-${seed}`));
      expect(scenario.conditions[0]).toContain('해고 예고의 예외 사유가 없으며');
      expect(scenario.conditions.some((condition) => condition.includes('문자 메시지는 해고의 서면 통지로 보지 않는다'))).toBe(facts.textMessage);
      if (gap === 0) expect(scenario.tables[0]?.rows[2]?.[1]).toContain('(해고 당일)');
    }
  });
});

describe('every signature module yields consistent plans', () => {
  const LABEL = /\([가나다라마바]\)|[㉠㉡㉢㉣㉤㉥]|[①②③④⑤]|<보기>/u;

  it.each(SIGNATURE_MODULES.map((module) => [module.kind, module] as const))('%s', (_kind, module) => {
    for (let seed = 0; seed < 120; seed += 1) {
      const rng = seededRandom(`${module.kind}-${seed}`);
      const scenario = module.build(rng);
      expect(Object.keys(scenario.templates).length).toBeGreaterThanOrEqual(2);
      for (const entry of Object.values(scenario.templates)) {
        expect(entry.trueText).not.toBe(entry.falseText);
        expect(entry.rationale.length).toBeGreaterThan(10);
      }
      for (const table of scenario.tables) {
        expect(table.rows.length).toBeGreaterThan(0);
        for (const row of table.rows) expect(row).toHaveLength(table.headers.length);
        expect(LABEL.test([table.title, ...table.headers, ...table.rows.flat()].join(' '))).toBe(false);
      }
      expect(LABEL.test(scenario.conditions.join(' '))).toBe(false);

      const statements = scenarioToPlan(scenario, 'statements', rng, {
        viewKeys: ['ㄱ', 'ㄴ', 'ㄷ'],
        trueViewKeys: ['ㄱ', 'ㄷ'],
        answerIndex: 1,
        polarity: 'positive',
      });
      expect(statements?.statements).toHaveLength(2);
      for (const statement of statements?.statements ?? []) {
        expect(statement.truth).toBe(['ㄱ', 'ㄷ'].includes(statement.key));
      }

      const negative = scenarioToPlan(scenario, 'choices', rng, { answerIndex: 2, polarity: 'negative' });
      expect(negative?.choices?.keyed.truth).toBe(false);
      expect(negative?.choices?.distractor.truth).toBe(true);

      if (scenario.numeric.length > 0) {
        const answerIndex = (seed % 5) + 1;
        const numeric = scenarioToPlan(scenario, 'numeric', rng, { answerIndex, polarity: 'positive' });
        if (numeric?.numeric !== undefined) {
          const question = scenario.numeric.find((entry) => entry.stem === numeric.numeric?.stem);
          expect(numeric.numeric.choices).toHaveLength(5);
          expect(new Set(numeric.numeric.choices).size).toBe(5);
          expect(numeric.numeric.choices[answerIndex - 1]).toBe(formatValue(question?.correct ?? NaN, question?.unit ?? ''));
          expect(numeric.numeric.stem.startsWith('다음')).toBe(true);
          expect(numeric.numeric.stem).toContain('옳은 것은?');
        }
      }
    }
  });
});

describe('planner and assembler integration', () => {
  function rawCandidate(spec: GenerativeItemSpec) {
    const truths = new Set(spec.trueViewKeys ?? []);
    return JSON.stringify({
      design: { scenario: '생산 계획', clues: ['a', 'b', 'c', 'd'], difficultyDevices: ['계산'] },
      blocks: [
        { type: 'text', text: '○○기업은 새로 개발한 제품의 생산 계획을 세우며 공정과 재고를 점검하였다. 생산 팀장은 현재 공정에서 시간이 가장 오래 걸리는 작업을 찾아 개선하려고 한다.', title: '', headers: [], rows: [], lines: [] },
        { type: 'table', text: '', title: '모델 표', headers: ['구분', '값'], rows: [['임의', '999']], lines: [] },
      ],
      stem: '모델이 쓴 발문',
      viewItems: (spec.viewKeys ?? []).map((key) => ({ key, text: `${key} 모델 문장`, truth: truths.has(key), basis: '' })),
      keyedChoice: { text: '모델 정답', basis: '' },
      otherChoices: ['가', '나', '다', '라'].map((text) => ({ text: `모델 오답 ${text}`, basis: '' })),
      explanation: { intent: '의도', solution: 'ㄱ ㄴ ㄷ ㄹ 풀이', distractorNotes: ['메모'] },
    });
  }

  it('turns 공업 일반 7단원 정답형 slots into numeric items (same module at most twice per exam)', () => {
    const plans = Array.from({ length: 8 }, (_, index) =>
      planGenerativeExam({
        subject: 'kongil',
        startUnitNum: 7,
        endUnitNum: 7,
        questionCount: 20,
        difficulty: Difficulty.HIGH,
        seed: `signature-k7-${index}`,
      }),
    );
    for (const plan of plans) {
      const kinds = plan.map((item) => item.calculation?.kind).filter((kind) => kind !== undefined);
      for (const kind of new Set(kinds)) expect(kinds.filter((entry) => entry === kind).length).toBeLessThanOrEqual(2);
    }
    const numeric = plans.flat().filter((item) => item.calculation?.format === 'numeric');
    expect(numeric.length).toBeGreaterThan(0);
    for (const item of numeric) {
      expect(item.responseMode).toBe('statement');
      expect(item.polarity).toBe('positive');
      expect(item.stemEnding).toBe('옳은 것은?');
      expect(item.stimulusShape).toBe('table+text');

      const candidate = applyCalculationPlan(item, parseGenerativeCandidate(rawCandidate(item), item));
      expect(candidate.stem).toBe(item.calculation?.numeric?.stem);
      expect(candidate.blocks.at(-1)?.text.startsWith('[조건]')).toBe(item.calculation?.conditions.length !== 0);
      const issues = validateGenerativeCandidate(item, candidate).map((issue) => issue.code);
      expect(issues).not.toContain('GEN_STEM_INVALID');
      expect(issues).not.toContain('GEN_CHOICES_INVALID');
      expect(issues).not.toContain('GEN_SCHEMA_INVALID');

      const assembled = assembleGenerativeQuestion(item, candidate);
      expect(assembled.optionsList.map((option) => option.slice(2))).toEqual(item.calculation?.numeric?.choices);
      expect(assembled.explanation.judgment).toContain('[계산 근거]');
    }
    expect(numeric.some((item) => item.targetConcept.name.includes('퍼트') || item.targetConcept.name.includes('자재') || item.targetConcept.name.includes('구매'))).toBe(true);
  });

  it('fixes the keyed and one distractor choice for 선지형 items and places the rationale on the right numbers', () => {
    const items = [14, 17].flatMap((unit) =>
      Array.from({ length: 6 }, (_, index) =>
        planGenerativeExam({
          subject: unit === 14 ? 'kongil' : 'success',
          startUnitNum: unit,
          endUnitNum: unit,
          questionCount: 20,
          difficulty: Difficulty.MIDDLE,
          seed: `signature-choices-${unit}-${index}`,
        }),
      ).flat(),
    ).filter((item) => item.calculation?.format === 'choices');
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const candidate = applyCalculationPlan(item, parseGenerativeCandidate(rawCandidate(item), item));
      const assembled = assembleGenerativeQuestion(item, candidate);
      const keyedAt = item.answerIndex - 1;
      const distractorAt = item.answerIndex === 1 ? 1 : 0;
      expect(assembled.optionsList[keyedAt].slice(2)).toBe(item.calculation?.choices?.keyed.text);
      expect(assembled.optionsList[distractorAt].slice(2)).toBe(item.calculation?.choices?.distractor.text);
    }
  });

  it('compares only model-written blocks of signature items for near-duplicates', () => {
    const item = planGenerativeExam({ subject: 'kongil', startUnitNum: 14, endUnitNum: 14, questionCount: 20, difficulty: Difficulty.MIDDLE, seed: 'dup' })
      .find((entry) => entry.calculation !== undefined);
    expect(item).toBeDefined();
    if (item === undefined) return;
    const candidate = applyCalculationPlan(item, parseGenerativeCandidate(rawCandidate(item), item));
    const text = duplicateCheckText(item, candidate.blocks);
    expect(text).toContain('○○기업은 새로 개발한 제품');
    expect(text).not.toContain('[조건]');
    expect(text).not.toContain(item.calculation?.tables[0].title ?? '?');
  });

  it('leaves units without signature modules untouched', () => {
    const subjects = [['kongil', 3], ['success', 4]] as const;
    for (const [subject, unit] of subjects) {
      expect(chooseSignature(subject, unit, 'truth_combination', 'positive', () => 0)).toBeUndefined();
      const plan = planGenerativeExam({ subject, startUnitNum: unit, endUnitNum: unit, questionCount: 10, difficulty: Difficulty.MIDDLE, seed: 'none' });
      expect(plan.every((item) => item.calculation === undefined)).toBe(true);
    }
  });
});

describe('job-seeking benefit wording', () => {
  it('never describes a voluntary leaver as receiving unemployment recognition', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const scenario = benefitScenario(seededRandom(`benefit-${seed}`));
      const rows = scenario.tables[0].rows;
      for (const row of rows) {
        const voluntary = /자진 퇴사|창업 준비/.test(row[3]);
        if (voluntary) expect(row[4]).not.toContain('실업 인정');
      }
      expect(scenario.tables[1].title).toContain('소정급여일수');
    }
  });
});
