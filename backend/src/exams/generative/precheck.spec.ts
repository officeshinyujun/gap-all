import { Difficulty } from '../../entities/difficulty';
import { conceptAliases } from './concept-leak';
import { blindSolveRejection, parseBlindSolveResult } from './generative-gates';
import { parseGenerativeCandidate, repairUnusedLabels, validateGenerativeCandidate } from './generative-item-assembler';
import { blindSolveResponseFormat, blindSolveSystemPrompt, selfCheck } from './generative-item-prompt';
import {
  blankCellIssues,
  copiedStatementIssues,
  explanationNumeralIssues,
  findRealEntities,
  laborHeadcountIssues,
  realEntityIssues,
} from './precheck';
import type { BlindSolveResult, GeneratedBlock, GenerativeCandidate, GenerativeItemSpec } from './generative.types';

const band = { p25: 20, median: 30, p75: 40 };

function spec(overrides: Partial<GenerativeItemSpec> = {}): GenerativeItemSpec {
  return {
    id: 'gen_precheck',
    ordinal: 1,
    subject: 'success',
    unitNumber: 15,
    unitTitle: '근로 관계 법',
    examFocus: '',
    targetConcept: { name: '연장 근로', definition: '', keyFacts: [], diagnosticCues: [], confusableWith: [], weight: 3 },
    companionConcepts: [],
    confusionPairs: [],
    responseMode: 'truth_combination',
    polarity: 'positive',
    stemEnding: '옳은 것만을 <보기>에서 있는 대로 고른 것은?',
    stemOpening: 'direct',
    stemExamples: [],
    conditionClause: false,
    material: { genre: '사례', blockShape: 'text', construction: '', labelling: '', share: 1 },
    stimulusShape: 'text',
    scenarioArchetype: '',
    viewKeys: ['ㄱ', 'ㄴ', 'ㄷ'],
    comboChoiceSet: ['ㄱ', 'ㄴ', 'ㄱㄷ', 'ㄴㄷ', 'ㄱㄴㄷ'],
    trueViewKeys: ['ㄱ', 'ㄷ'],
    answerIndex: 3,
    falseTechniques: [],
    trueStatementPatterns: [],
    difficulty: Difficulty.MIDDLE,
    points: 3,
    difficultyLevers: [],
    lengths: { stem: { p25: 40, median: 55, p75: 70 }, stimulus: { p25: 80, median: 200, p75: 300 }, viewItem: band, choice: band },
    toneAndRegister: '',
    numericConventions: '',
    pitfallsToAvoid: [],
    diversityHint: '',
    unitDifficultyTier: 'hard',
    ...overrides,
  };
}

const block = (overrides: Partial<GeneratedBlock>): GeneratedBlock => ({ type: 'text', text: '', title: '', headers: [], rows: [], lines: [], ...overrides });

function candidate(overrides: Partial<GenerativeCandidate> = {}): GenerativeCandidate {
  return {
    design: { scenario: '', clues: [], difficultyDevices: ['계산'] },
    blocks: [block({ text: 'A 씨는 ○○ 식당에서 평일 저녁마다 일하며, 지난주에는 금요일에 2시간을 더 일하였다.' })],
    stem: '다음 사례에 대한 분석으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
    viewItems: [
      { key: 'ㄱ', text: '금요일 추가 근로에 대해 가산 수당을 받을 수 있다.', truth: true, basis: '' },
      { key: 'ㄴ', text: '주휴일에 대한 유급 수당을 받을 수 없다.', truth: false, basis: '' },
      { key: 'ㄷ', text: '근로 계약서를 서면으로 교부받아야 한다.', truth: true, basis: '' },
    ],
    explanation: { intent: 'x', solution: 'ㄱ, ㄴ, ㄷ', distractorNotes: ['ㄴ'], clues: [], steps: [], takeaway: '' },
    ...overrides,
  } as GenerativeCandidate;
}

const solve = (overrides: Partial<BlindSolveResult> = {}): BlindSolveResult => ({
  answerIndex: 3, ambiguity: 'none', curriculumIssues: [], answerGivenAway: false,
  perceivedDifficulty: 'hard', trivialStatements: [], reasoning: 'r', ...overrides,
});

describe('precheck (skill-only instant rejections)', () => {
  it('flags table cells left blank or holding only a unit', () => {
    expect(blankCellIssues([block({ type: 'table', headers: ['구분', '인원'], rows: [['A 기업', '명']] })])).toHaveLength(1);
    expect(blankCellIssues([block({ type: 'table', headers: ['구분', '인원'], rows: [['A 기업', '']] })])).toHaveLength(1);
    expect(blankCellIssues([block({ type: 'table', headers: ['구분', '인원'], rows: [['A 기업', '㉠명'], ['B 기업', '-']] })])).toEqual([]);
  });

  it('flags real companies, brands and people but not look-alike common words', () => {
    expect(findRealEntities(['A 씨는 삼성전자에 입사하였다.'])).toEqual(['삼성']);
    expect(findRealEntities(['LG 매장에서 일한다.', '스타벅스에서 아르바이트를 한다.'])).toEqual(expect.arrayContaining(['LG', '스타벅스']));
    expect(findRealEntities(['스티브 잡스처럼 창업하고 싶다.'])).toEqual(['스티브 잡스']);
    // 일반어: 현대 사회, 토스트, 기아(飢餓), 애플리케이션, SKU
    expect(findRealEntities(['현대 사회에서 토스트 가게를 열고 애플리케이션으로 주문받는다. 기아 문제와 SKU 관리'])).toEqual([]);
    const issues = realEntityIssues([block({ text: '카카오에서 일하는 B 씨' })], [], '다음 사례에 대한 설명으로 옳은 것은?');
    expect(issues[0]?.message).toContain('○○기업');
    expect(realEntityIssues([block({ text: '○○기업에서 일하는 B 씨' })], [], '')).toEqual([]);
  });

  it('flags statements copied from one stimulus sentence', () => {
    const item = candidate({
      blocks: [block({ text: 'A 씨는 매주 토요일마다 지역 아동 센터에서 무료로 공부를 가르치는 봉사를 한다.' })],
      viewItems: [
        { key: 'ㄱ', text: 'A 씨는 매주 토요일마다 지역 아동 센터에서 무료로 공부를 가르친다.', truth: true, basis: '' },
        { key: 'ㄴ', text: '일의 대가로 받는 보수가 생계를 유지하는 주된 수단이다.', truth: false, basis: '' },
        { key: 'ㄷ', text: '자아실현 수단으로서의 직업관이 드러난다고 볼 수 있다.', truth: true, basis: '' },
      ],
    });
    const issues = copiedStatementIssues(spec(), item, new Set());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('A 씨는 매주 토요일마다');
    expect(copiedStatementIssues(spec(), item, new Set([item.viewItems![0].text]))).toEqual([]);
  });

  it('requires the headcount when a 15·16단원 statement decides a 5-person-scope rule', () => {
    const item = candidate();
    const text = item.blocks[0].text;
    expect(laborHeadcountIssues(spec(), item, text)[0]?.message).toContain('상시 근로자 수');
    expect(laborHeadcountIssues(spec(), item, `${text} 이 식당의 상시 근로자는 4명이다.`)).toEqual([]);
    expect(laborHeadcountIssues(spec(), item, `${text} 이 식당에는 직원 7명이 근무한다.`)).toEqual([]);
    // 주휴·해고 예고·근로 계약서처럼 5명 미만에도 적용되는 제도만 다루면 인원을 요구하지 않는다.
    const sizeFree = candidate({ viewItems: item.viewItems!.map((view, index) => (index === 0 ? { ...view, text: '해고 예고를 30일 전에 받아야 한다.' } : view)) });
    expect(laborHeadcountIssues(spec(), sizeFree, text)).toEqual([]);
    expect(laborHeadcountIssues(spec({ unitNumber: 17 }), item, text)).toEqual([]);
    expect(laborHeadcountIssues(spec({ subject: 'kongil' }), item, text)).toEqual([]);
  });

  it('rejects choice numerals in solution and distractor notes of single-answer items, but allows steps', () => {
    const single = spec({ responseMode: 'statement', stemEnding: '가장 적절한 것은?' });
    const withNumeral = candidate({ explanation: { intent: 'x', solution: '①이 정답이다.', distractorNotes: [], clues: [], steps: [], takeaway: '' } });
    expect(explanationNumeralIssues(single, withNumeral)[0]?.code).toBe('GEN_EXPLANATION_INVALID');
    const inSteps = candidate({ explanation: { intent: 'x', solution: '위기관리 능력이 정답이다.', distractorNotes: ['도전 정신은 성년기'], clues: [], steps: ['① 나이를 구한다'], takeaway: '' } });
    expect(explanationNumeralIssues(single, inSteps)).toEqual([]);
    expect(explanationNumeralIssues(spec(), withNumeral)).toEqual([]);
  });

  it('runs only when the skill turns the precheck option on (server validation unchanged)', () => {
    const raw = {
      design: { scenario: 's', clues: ['a', 'b', 'c', 'd'], difficultyDevices: ['계산'] },
      blocks: [{ type: 'text', text: '쿠팡 물류 센터에서 일하는 A 씨는 지난주 금요일에 평소보다 2시간을 더 일하였고, 토요일에는 쉬었다.', title: '', headers: [], rows: [], lines: [] }],
      stem: '다음 사례의 A 씨에 대한 분석으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      viewItems: candidate().viewItems,
      explanation: { intent: 'x', solution: 'ㄱ은 옳다. ㄴ은 옳지 않다. ㄷ은 옳다.', distractorNotes: ['ㄴ'], clues: [], steps: [], takeaway: '' },
    };
    const parsed = parseGenerativeCandidate(JSON.stringify(raw), spec());
    const base = validateGenerativeCandidate(spec(), parsed).map((issue) => issue.message);
    const strict = validateGenerativeCandidate(spec(), parsed, { precheck: true }).map((issue) => issue.message);
    expect(base.some((message) => /실존 기업|상시 근로자 수/u.test(message))).toBe(false);
    expect(strict.filter((message) => !base.includes(message))).toEqual([
      expect.stringContaining('실존 기업'),
      expect.stringContaining('상시 근로자 수'),
    ]);
  });

  it('keeps table-head labels for the skill so the item is rejected instead of leaving a bare "지역"', () => {
    const item = candidate({
      blocks: [block({ type: 'table', headers: ['구분', '(가) 기업', '(나) 기업'], rows: [['사원 구성', '무한 책임 사원', '유한 책임 사원']] })],
      stem: '다음 표의 (가)에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
    });
    expect(repairUnusedLabels(item).blocks[0].headers).toEqual(['구분', '(가) 기업', '기업']);
    expect(repairUnusedLabels(item, { keepTableHeadLabels: true })).toBe(item);
  });
});

describe('blind review fix mode and data-free statements', () => {
  it('replans only on answer mismatch or major ambiguity and repairs everything else', () => {
    const s = spec({ ultra: true });
    expect(blindSolveRejection(s, solve({ answerIndex: 1 }))?.fix).toBe('replan');
    expect(blindSolveRejection(s, solve({ ambiguity: 'major' }))?.fix).toBe('replan');
    expect(blindSolveRejection(s, solve({ ambiguity: 'minor', curriculumIssues: ['표현 다듬기'] }))?.fix).toBe('repair');
    expect(blindSolveRejection(s, solve({ answerGivenAway: true }))?.fix).toBe('repair');
    expect(blindSolveRejection(s, solve({ trivialStatements: ['ㄴ'] }))?.fix).toBe('repair');
    expect(blindSolveRejection(s, solve({ perceivedDifficulty: 'moderate' }))?.fix).toBe('repair');
    expect(blindSolveRejection(spec(), solve({ perceivedDifficulty: 'easy' }))?.fix).toBe('repair');
    expect(blindSolveRejection(s, solve())).toBeNull();
  });

  it('limits data-free statements to 1 for 3-point and 2 for 2-point items, only when the field is present', () => {
    expect(blindSolveRejection(spec(), solve({ dataFreeStatements: ['ㄱ'] }))).toBeNull();
    expect(blindSolveRejection(spec(), solve({ dataFreeStatements: ['ㄱ', 'ㄴ'] }))).toMatchObject({ code: 'GEN_TOO_EASY', fix: 'repair' });
    const two = spec({ points: 2 });
    expect(blindSolveRejection(two, solve({ dataFreeStatements: ['ㄱ', 'ㄴ'] }))).toBeNull();
    expect(blindSolveRejection(two, solve({ dataFreeStatements: ['ㄱ', 'ㄴ', 'ㄷ'] }))?.code).toBe('GEN_TOO_EASY');
    // 서버 검토 응답(필드 없음)은 빈 배열로 읽혀 판정이 바뀌지 않는다.
    const parsed = parseBlindSolveResult(JSON.stringify({ answerIndex: 3, ambiguity: 'none', perceivedDifficulty: 'hard' }));
    expect(parsed.dataFreeStatements).toEqual([]);
    expect(blindSolveRejection(spec(), parsed)).toBeNull();
  });

  it('adds dataFreeStatements to the review schema and prompt only for the skill', () => {
    const server = blindSolveResponseFormat().json_schema.schema;
    expect(server.required).not.toContain('dataFreeStatements');
    expect(Object.keys(server.properties)).not.toContain('dataFreeStatements');
    expect(blindSolveSystemPrompt()).not.toContain('dataFreeStatements');
    const skill = blindSolveResponseFormat({ dataFree: true }).json_schema.schema;
    expect(skill.required).toContain('dataFreeStatements');
    expect(Object.keys(skill.properties)).toContain('dataFreeStatements');
    expect(blindSolveSystemPrompt({ dataFree: true })).toContain('dataFreeStatements');
  });

  it('writes the self-check with 직업탐구 limits by points', () => {
    const three = selfCheck(spec()).join('\n');
    expect(three).toContain('단순 읽기 0개');
    expect(three).toContain('자료 없이 풀리는 진술 1개 이하');
    expect(three).toContain('상시 근로자 수');
    expect(three).toContain('○○기업');
    const two = selfCheck(spec({ points: 2, responseMode: 'statement' })).join('\n');
    expect(two).toContain('단순 읽기 1개 이하');
    expect(two).toContain('자료 없이 풀리는 진술 2개 이하');
    expect(selfCheck(spec())).toHaveLength(9);
  });

  it('does not treat generic words like "구분" as concept names', () => {
    expect(conceptAliases('직업관의 구분')).not.toContain('구분');
    expect(conceptAliases('기업 형태의 특성과 차이')).not.toContain('차이');
  });
});
