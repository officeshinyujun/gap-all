import { Difficulty } from '../../../entities/difficulty';
import { seededRandom, planGenerativeExam } from '../generative-item-planner';
import { applyCalculationPlan, assembleGenerativeQuestion, parseGenerativeCandidate } from '../generative-item-assembler';
import {
  buildLaborCalculationPlan,
  laborDerived,
  laborStatementTemplates,
  laborTable,
  requiredBreakMinutes,
  type LaborFacts,
} from './labor-calculation';

const base: LaborFacts = {
  workerLabel: 'A 씨',
  workplaceLabel: '○○문구',
  workplaceSize: 4,
  startMinutes: 9 * 60,
  dailyWorkHours: 8,
  breakMinutes: 60,
  hourlyWage: 12_000,
  contractStart: { year: 2026, month: 3, day: 2 },
  contractMonths: 6,
};

describe('labor calculation (성직 근로관계와 법)', () => {
  it('uses the statutory minimum break', () => {
    expect([3, 4, 7, 8].map(requiredBreakMinutes)).toEqual([0, 30, 30, 60]);
  });

  it('computes weekly hours, holiday pay and overtime for a small workplace', () => {
    const d = laborDerived(base);
    expect(d.weeklyHours).toBe(40);
    expect(d.weeklyHolidayPay).toBe(96_000); // 1일 소정 8시간 × 12,000원
    expect(d.weeklyPayWithHoliday).toBe(576_000);
    expect(d.overtimeHourlyPay).toBe(12_000); // 5명 미만: 가산 없음
    expect(laborDerived({ ...base, workplaceSize: 30 }).overtimeHourlyPay).toBe(18_000);
  });

  it('presents clock times with the break so students must subtract it', () => {
    const table = laborTable(base);
    expect(table.rows).toContainEqual(['소정 근로 시간', '09:00~18:00 (휴게 시간 13:00~14:00)']);
    expect(table.rows).toContainEqual(['근로 계약 기간', '2026년 3월 2일부터 2026년 9월 1일까지']);
    expect(laborTable({ ...base, dailyWorkHours: 5, breakMinutes: 30 }).rows)
      .toContainEqual(['소정 근로 시간', '09:00~14:30 (휴게 시간 11:00~11:30)']);
  });

  it('mirrors real exam traps in false statements', () => {
    const small = laborStatementTemplates(base);
    expect(small.weeklyHours.falseText).toContain('45시간'); // 휴게 미차감
    expect(small.holidayPay.falseText).toContain('주휴 수당을 받을 수 없다'); // 5명 미만에도 주휴 적용
    expect(small.annualLeave.trueText).toContain('적용되지 않는다');
    const large = laborStatementTemplates({ ...base, workplaceSize: 150, hourlyWage: 12_000 });
    expect(large.overtime.trueText).toContain('18,000원');
    expect(large.annualLeave.falseText).toContain('15일'); // 1년 미만인데 15일
    expect(large.severance.trueText).toContain('퇴직금을 받을 수 없다');
  });

  it('assigns one true and one false calculation statement consistent with the planned truth values', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const rng = seededRandom(`labor-${seed}`);
      const plan = buildLaborCalculationPlan(rng, ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'], ['ㄱ', 'ㄷ']);
      expect(plan.statements).toHaveLength(2);
      for (const statement of plan.statements) {
        expect(statement.truth).toBe(['ㄱ', 'ㄷ'].includes(statement.key));
      }
      const templates = laborStatementTemplates(plan.facts);
      for (const template of Object.values(templates)) {
        expect(template.trueText).not.toBe(template.falseText);
      }
      expect(plan.facts.breakMinutes).toBe(requiredBreakMinutes(plan.facts.dailyWorkHours));
    }
  });

  it('turns some 성직 15단원 보기형·선지형 slots into calculation items with a contract table', () => {
    const plan = planGenerativeExam({
      subject: 'success',
      startUnitNum: 15,
      endUnitNum: 15,
      questionCount: 12,
      difficulty: Difficulty.HIGH,
      seed: 'calc-unit-15',
    });
    const calc = plan.filter((item) => item.calculation !== undefined);
    expect(calc.length).toBeGreaterThan(0);
    for (const item of calc) {
      expect(item.calculation?.format).toBe(item.responseMode === 'truth_combination' ? 'statements' : 'choices');
      expect(item.stimulusShape).toBe('table+text');
      for (const statement of item.calculation?.statements ?? []) {
        expect(item.trueViewKeys?.includes(statement.key as never)).toBe(statement.truth);
      }
    }
    const kongil = planGenerativeExam({ ...{ subject: 'kongil' as const, startUnitNum: 15, endUnitNum: 15, questionCount: 12, difficulty: Difficulty.HIGH, seed: 'calc-k' } });
    expect(kongil.some((item) => item.calculation !== undefined)).toBe(false);
  });

  it('overwrites the model table and calculation 보기 with server values and appends the computation', () => {
    const [item] = planGenerativeExam({
      subject: 'success',
      startUnitNum: 15,
      endUnitNum: 15,
      questionCount: 12,
      difficulty: Difficulty.HIGH,
      seed: 'calc-unit-15',
    }).filter((entry) => entry.calculation?.format === 'statements');
    const keys = item.viewKeys ?? [];
    const truths = new Set(item.trueViewKeys ?? []);
    const raw = {
      design: { scenario: '근로 계약 조사', clues: ['a', 'b', 'c', 'd'], difficultyDevices: ['계산'] },
      blocks: [
        { type: 'text', text: '수행 평가로 지역 사업장의 근로 계약 사례를 조사하였다.', title: '', headers: [], rows: [], lines: [] },
        { type: 'table', text: '', title: '다른 표', headers: ['구분', '내용'], rows: [['임금', '시간당 99,999원']], lines: [] },
      ],
      stem: '다음 근로 계약 사례에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      viewItems: keys.map((key) => ({ key, text: `${key} 모델이 쓴 문장`, truth: truths.has(key), basis: '' })),
      explanation: { intent: '의도', solution: keys.join(' '), distractorNotes: ['메모'] },
    };
    const candidate = applyCalculationPlan(item, parseGenerativeCandidate(JSON.stringify(raw), item));
    const table = candidate.blocks.find((block) => block.type === 'table');
    expect(table?.rows).toEqual(item.calculation?.tables[0].rows);
    for (const statement of item.calculation?.statements ?? []) {
      const view = candidate.viewItems?.find((entry) => entry.key === statement.key);
      expect(view?.text).toBe(statement.text);
      expect(view?.truth).toBe(statement.truth);
    }
    expect(assembleGenerativeQuestion(item, candidate).explanation.judgment).toContain('[계산 근거]');
  });
});
