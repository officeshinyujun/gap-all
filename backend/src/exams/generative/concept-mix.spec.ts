import { Difficulty } from '../../entities/difficulty';
import { assignConceptSlots, resolveConcepts } from './concept-slots';
import { blindSolveRejection, parseBlindSolveResult } from './generative-gates';
import { parseGenerativeCandidate } from './generative-item-assembler';
import { planGenerativeSlots, replanGenerativeItem, type GenerativePlanRequest } from './generative-item-planner';
import {
  blindSolveResponseFormat,
  blindSolveSystemPrompt,
  generativeItemResponseFormat,
  skillWritingAddendum,
  textbookReference,
} from './generative-item-prompt';
import { conditionCriteria, mixUseIssues, stemOverloadIssues } from './precheck';
import { planConceptExam, reviewBrief } from './skill/skill-engine';
import type { BlindSolveResult, GenerativeItemSpec } from './generative.types';

const request: GenerativePlanRequest = {
  subject: 'success',
  startUnitNum: 2,
  endUnitNum: 9,
  questionCount: 3,
  difficulty: Difficulty.HIGH,
  seed: 'mix-test',
  ultra: true,
};

const solve = (overrides: Partial<BlindSolveResult> = {}): BlindSolveResult => ({
  answerIndex: 3, ambiguity: 'none', curriculumIssues: [], answerGivenAway: false,
  perceivedDifficulty: 'moderate', trivialStatements: [], reasoning: 'r', ...overrides,
});

describe('concept-locked planning (skill)', () => {
  it('resolves exact or uniquely contained names and refuses to guess otherwise', () => {
    const [hoffman] = resolveConcepts('success', ['호프만비율']);
    expect(hoffman).toMatchObject({ unitNumber: 6, concept: { name: '생산재 제조업과 소비재 제조업(호프만 비율)' } });
    expect(resolveConcepts('success', ['마샤의 자아 정체감 유형'])[0].unitNumber).toBe(2);
    // "회사기업 특징"을 "미래 사회의 특징"으로 조용히 고르지 않고 후보를 보여 주며 멈춘다.
    expect(() => resolveConcepts('success', ['회사기업 특징'])).toThrow(/하나로 정하지 못했습니다/u);
    expect(() => resolveConcepts('success', ['ㅈ하리의창'])).toThrow(/조하리의 창/u);
  });

  it('turns every concept into a target when concepts ≤ items, and fills extra slots in the same units', () => {
    const resolved = resolveConcepts('success', ['주식회사', '능력단위']);
    const slots = assignConceptSlots(resolved, 3);
    expect(slots).toHaveLength(3);
    expect(slots.filter((slot) => slot.concept !== undefined).map((slot) => slot.concept?.name)).toEqual(['주식회사', '능력단위']);
    expect(slots.every((slot) => slot.mix.length === 0)).toBe(true);
    expect(slots.map((slot) => slot.unitNumber).sort()).toEqual([4, 4, 9]);
  });

  it('mixes surplus concepts into the nearest-unit item, one target per unit first', () => {
    const resolved = resolveConcepts('success', ['주식회사', '협동조합', '사회적 기업', '능력단위', '조하리의 창(Johari\'s Window)']);
    const slots = assignConceptSlots(resolved, 3);
    expect(slots.map((slot) => slot.concept?.name)).toEqual(['조하리의 창(Johari\'s Window)', '주식회사', '능력단위']);
    // 4단원 개념은 4단원 문항에 붙는다(3단원 조하리 문항이 아니라)
    expect(slots[1].mix.map((concept) => concept.name).sort()).toEqual(['사회적 기업', '협동조합']);
  });

  it('plans forced targets with mix concepts, no fixed calculation, and keeps them when replanned', () => {
    const resolved = resolveConcepts('success', ['주식회사', '사회적 기업', '능력단위']);
    const specs = planGenerativeSlots(request, assignConceptSlots(resolved, 2));
    expect(specs.map((spec) => spec.targetConcept.name)).toEqual(['주식회사', '능력단위']);
    expect(specs[0].mixConcepts?.map((concept) => concept.name)).toEqual(['사회적 기업']);
    expect(specs.every((spec) => spec.conceptLocked === true && spec.calculation === undefined)).toBe(true);
    const replanned = replanGenerativeItem(request, specs[0], 2, ['주식회사', '능력단위']);
    expect(replanned.id).not.toBe(specs[0].id);
    expect(replanned.targetConcept.name).toBe('주식회사');
    expect(replanned.mixConcepts?.map((concept) => concept.name)).toEqual(['사회적 기업']);
    expect(replanned.conceptLocked).toBe(true);
    // 고정하지 않은 명세는 기존처럼 다른 개념으로 바꾼다(서버 동작 그대로)
    const { conceptLocked: _locked, mixConcepts: _mix, ...unlocked } = specs[0];
    expect(replanGenerativeItem(request, unlocked as GenerativeItemSpec, 2, ['주식회사']).targetConcept.name).not.toBe('주식회사');
  });

  it('builds the whole plan from concept names via the skill engine', () => {
    const { specs, request: planned } = planConceptExam({ subject: 'success', concepts: ['주식회사', '사회적 기업', '능력단위'], count: 2, difficulty: Difficulty.HIGH, ultra: true, seed: 's' });
    expect(planned).toMatchObject({ startUnitNum: 4, endUnitNum: 9, questionCount: 2, ultra: true });
    expect(specs).toHaveLength(2);
  });
});

describe('mix concepts in briefs, schema and checks', () => {
  const [spec] = planGenerativeSlots(request, assignConceptSlots(resolveConcepts('success', ['주식회사', '사회적 기업']), 1));

  it('asks for design.mixUse only when the spec has mix concepts (server schema unchanged)', () => {
    const design = (schema: unknown) => (schema as { properties: { design: { required: string[]; properties: Record<string, unknown> } } }).properties.design;
    expect(design(generativeItemResponseFormat(spec).json_schema.schema).required).toContain('mixUse');
    const { mixConcepts: _mix, ...plain } = spec;
    expect(Object.keys(design(generativeItemResponseFormat(plain as GenerativeItemSpec).json_schema.schema).properties)).not.toContain('mixUse');
  });

  it('writes the stem rules and the mix section into the writing addendum', () => {
    const text = skillWritingAddendum(spec).join('\n');
    expect(text).toContain('## 발문 문장');
    expect(text).toContain('## 함께 엮을 개념');
    expect(text).toContain('사회적 기업');
    expect(skillWritingAddendum({ ...spec, mixConcepts: undefined }).join('\n')).not.toContain('## 함께 엮을 개념');
  });

  it('rejects a candidate whose mixUse misses a concept or points at no real statement', () => {
    const candidate = (mixUse: unknown) => parseGenerativeCandidate(JSON.stringify({ design: { scenario: 's', clues: [], difficultyDevices: [], mixUse }, blocks: [], stem: '', otherChoices: [{ text: 'a', basis: '' }], explanation: {} }), spec);
    const statement = { ...spec, responseMode: 'statement' as const };
    expect(mixUseIssues(statement, candidate([]))[0]?.message).toContain('사회적 기업');
    expect(mixUseIssues(statement, candidate([{ concept: '사회적 기업', statements: ['ㄷ'] }]))).toHaveLength(1);
    expect(mixUseIssues(statement, candidate([{ concept: '사회적 기업', statements: ['오답1'] }]))).toEqual([]);
  });

  it('gives the reviewer textbook definitions without diagnostic cues, in name order', () => {
    const lines = textbookReference(spec);
    expect(lines.join('\n')).toContain('[교과서 기준]');
    expect(lines.join('\n')).toContain('사회적 기업');
    expect(lines.join('\n')).not.toContain(spec.targetConcept.diagnosticCues[0] ?? '∅∅');
  });
});

describe('stem overload check', () => {
  it('flags two criteria in one condition and two conditions, but keeps real exam conditions', () => {
    expect(conditionCriteria('(단, 자아 정체감 유형은 마샤(Marcia, J.), 발달 과업은 해비거스트(Havighurst, R. J.)의 이론에 근거한다.)')).toHaveLength(2);
    expect(conditionCriteria('(단, 각 과제는 단계의 순서대로 수행하며, 입지 요인은 경제적·자연적·사회적 요인으로만 구분한다.)')).toHaveLength(2);
    // 기출 조건: 법령 근거·부정형 사실 전제는 기준으로 세지 않는다
    expect(conditionCriteria('(단, ｢근로기준법｣에 따르며, 제시된 근무 외의 근로는 없다.)')).toHaveLength(0);
    expect(conditionCriteria('(단, ｢산업재해보상보험법｣에 따르며, A 씨의 고의는 없었다.)')).toHaveLength(0);
    expect(conditionCriteria('(단, 사고 형태는 산업 재해 분류 기준에 따르며, ｢산업재해보상보험법｣에 따른다.)')).toHaveLength(1);
    expect(conditionCriteria('(단, 의사 결정 유형은 하렌(Harren, V. A.)의 진로 의사 결정 유형 이론에 근거한 합리적, 직관적, 의존적 유형으로만 구분한다.)')).toHaveLength(1);
    const ending = '적절한 것만을 <보기>에서 고른 것은?';
    expect(stemOverloadIssues(`다음 상담 기록에 나타난 A 씨에 대한 분석으로 ${ending} (단, 발달 과업은 해비거스트의 이론에 근거한다.)`, ending)).toEqual([]);
    expect(stemOverloadIssues(`다음 상담 기록에 나타난 A 씨에 대한 분석으로 ${ending} (단, 자아 정체감 유형은 마샤, 발달 과업은 해비거스트의 이론에 근거한다.)`, ending)[0]?.code).toBe('GEN_STEM_INVALID');
    expect(stemOverloadIssues(`다음 기록에 대한 분석으로 ${ending} (단, 가는 A에 근거한다.) (단, 나는 B에 근거한다.)`, ending)).toHaveLength(1);
    expect(stemOverloadIssues(`다음 ${'아주 긴 수식어가 겹친 '.repeat(8)}자료에 대한 분석으로 ${ending}`, ending)[0]?.message).toContain('본문');
  });
});

describe('skill review gates', () => {
  const ultra = { answerIndex: 3 as const, points: 3 as const, difficulty: Difficulty.HIGH, ultra: true };

  it('judges ULTRA by statement steps and shortcuts when the analysis is present', () => {
    const steps = (values: number[]) => values.map((value, index) => ({ label: 'ㄱㄴㄷㄹ'[index], steps: value }));
    expect(blindSolveRejection(ultra, solve({ statementAnalysis: steps([2, 3, 2, 2]), eliminationShortcut: false }))).toBeNull();
    expect(blindSolveRejection(ultra, solve({ statementAnalysis: steps([2, 1, 2, 2]), eliminationShortcut: false }))?.message).toContain('ㄴ');
    expect(blindSolveRejection(ultra, solve({ statementAnalysis: steps([2, 2, 2, 2]), eliminationShortcut: true }))).toMatchObject({ code: 'GEN_TOO_EASY', fix: 'repair' });
    // 분석이 없으면 예전처럼 체감 난도로 판정한다
    expect(blindSolveRejection(ultra, solve())?.message).toContain('moderate');
  });

  it('repairs stems the reviewer cannot read in one pass and mix concepts not used for judging', () => {
    expect(blindSolveRejection(ultra, solve({ perceivedDifficulty: 'hard', stemIssues: ['조건이 둘'] }))).toMatchObject({ code: 'GEN_STEM_INVALID', fix: 'repair' });
    const mixed = { ...ultra, mixConcepts: [{ name: '사회적 기업' }, { name: '협동조합' }] as GenerativeItemSpec['mixConcepts'] };
    expect(blindSolveRejection(mixed, solve({ perceivedDifficulty: 'hard', mixConceptsUsed: ['사회적 기업'] }))?.message).toContain('협동조합');
    expect(blindSolveRejection(mixed, solve({ perceivedDifficulty: 'hard', mixConceptsUsed: ['사회적 기업', '협동조합'] }))).toBeNull();
  });

  it('parses the new fields only when present, and keeps the server review schema unchanged', () => {
    expect(parseBlindSolveResult(JSON.stringify({ answerIndex: 1 })).statementAnalysis).toBeUndefined();
    expect(parseBlindSolveResult(JSON.stringify({ answerIndex: 1, statementAnalysis: [{ label: 'ㄱ', steps: 2 }], stemIssues: [] }))).toMatchObject({ statementAnalysis: [{ label: 'ㄱ', steps: 2 }], stemIssues: [] });
    const server = blindSolveResponseFormat().json_schema.schema;
    expect(Object.keys(server.properties)).toEqual(['reasoning', 'answerIndex', 'ambiguity', 'curriculumIssues', 'answerGivenAway', 'perceivedDifficulty', 'trivialStatements']);
    expect(blindSolveSystemPrompt()).not.toMatch(/statementAnalysis|stemIssues|mixConceptsUsed/u);
    const skill = blindSolveResponseFormat({ statementAnalysis: true, stemReview: true, mixConcepts: ['협동조합'] }).json_schema.schema;
    expect(skill.required).toEqual(expect.arrayContaining(['statementAnalysis', 'eliminationShortcut', 'stemIssues', 'mixConceptsUsed']));
  });

  it('builds review briefs with the textbook reference and the matching schema', () => {
    const [spec] = planGenerativeSlots(request, assignConceptSlots(resolveConcepts('success', ['주식회사', '사회적 기업']), 1));
    const question = { questionStem: '다음 자료에 대한 설명으로 옳은 것은?', stimulusData: { blocks: [], figures: {}, choice_table: null }, optionsList: ['① 가', '② 나', '③ 다', '④ 라', '⑤ 마'], comboBlock: null };
    const brief = reviewBrief(spec, question as never);
    expect(brief.user).toContain('[교과서 기준]');
    expect((brief.schema as { required: string[] }).required).toEqual(expect.arrayContaining(['stemIssues', 'mixConceptsUsed', 'statementAnalysis']));
  });
});
