import { Difficulty } from '../../../entities/difficulty';
import { keepHighPointsOffLabelModes } from '../generative-item-planner';
import {
  checkCandidate,
  judgeReview,
  planExam,
  rebalancePoints,
  reviewPoints,
  reviewBrief,
  toAppQuestion,
  toPlanRequest,
  writingBrief,
} from './skill-engine';

describe('exam-question-generator skill engine', () => {
  const request = toPlanRequest({ subject: 'kongil', startUnit: 10, endUnit: 10, count: 3, difficulty: Difficulty.MIDDLE, seed: 'skill-test' });

  it('validates plan arguments', () => {
    expect(() => toPlanRequest({ subject: 'kongil', startUnit: 5, endUnit: 3, count: 3, difficulty: Difficulty.MIDDLE })).toThrow();
    expect(() => toPlanRequest({ subject: 'kongil', startUnit: 1, endUnit: 2, count: 0, difficulty: Difficulty.MIDDLE })).toThrow();
  });

  it('produces a writing brief with the same prompt and JSON schema as the server pipeline', () => {
    const [spec] = planExam(request);
    const brief = writingBrief(spec);
    expect(brief.system).toContain('출제위원');
    expect(brief.user).toContain(`# 출제 명세 (${spec.id})`);
    expect(brief.schema).toMatchObject({ type: 'object', required: expect.arrayContaining(['design', 'blocks', 'stem', 'explanation']) });
  });

  it('reports engine issues for a broken candidate instead of throwing', () => {
    const [spec] = planExam(request);
    const result = checkCandidate(spec, '{"stem":"x"}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
    expect(checkCandidate(spec, 'not json')).toMatchObject({ ok: false });
  });

  it('judges blind reviews with the pipeline gate', () => {
    const [spec] = planExam(request);
    const review = (answerIndex: number, extra: Record<string, unknown> = {}) => JSON.stringify({
      reasoning: 'r', answerIndex, ambiguity: 'none', curriculumIssues: [], answerGivenAway: false,
      perceivedDifficulty: 'moderate', trivialStatements: [], ...extra,
    });
    expect(judgeReview(spec, review(spec.answerIndex))).toEqual({ accepted: true });
    expect(judgeReview(spec, review((spec.answerIndex % 5) + 1))).toMatchObject({ accepted: false, rejection: { code: 'GEN_BLIND_SOLVE_MISMATCH' } });
    expect(judgeReview(spec, review(spec.answerIndex, { curriculumIssues: ['법정 수치 오류'] }))).toMatchObject({ accepted: false, rejection: { code: 'GEN_AMBIGUOUS' } });
    expect(judgeReview(spec, '{}')).toMatchObject({ accepted: false, invalid: expect.any(String) });
  });

  it('takes an easy 3-point item as 2 points on mixed-point exams instead of rejecting it', () => {
    const [base] = planExam(request);
    const review = (extra: Record<string, unknown> = {}) => JSON.stringify({
      reasoning: 'r', answerIndex: base.answerIndex, ambiguity: 'none', curriculumIssues: [], answerGivenAway: false,
      perceivedDifficulty: 'easy', trivialStatements: [], dataFreeStatements: [], ...extra,
    });
    const three = { ...base, points: 3 as const };
    expect(judgeReview(three, review())).toEqual({ accepted: true, downgraded: true });
    // 2점 기준도 넘지 못하는 결함(단순 읽기 진술 2개)은 그대로 반려
    expect(judgeReview(three, review({ trivialStatements: ['ㄱ', 'ㄴ'] }))).toMatchObject({ accepted: false, rejection: { code: 'GEN_TOO_EASY' } });
    // 전부 3점인 상 난이도·초고난도는 내리지 않는다
    expect(judgeReview({ ...three, difficulty: Difficulty.HIGH }, review())).toMatchObject({ accepted: false });
    expect(judgeReview({ ...three, ultra: true }, review())).toMatchObject({ accepted: false });
    expect(reviewPoints(three, 4, review())).toMatchObject({ downgraded: true, eligibleFor3: false });
    expect(reviewPoints({ ...base, points: 2 }, 5, review({ perceivedDifficulty: 'hard' }))).toMatchObject({ downgraded: false, eligibleFor3: true });
  });

  it('keeps the planned number of 3-point items by promoting the hardest eligible 2-point items', () => {
    const result = rebalancePoints([
      { ordinal: 1, points: 3, downgraded: true, eligibleFor3: false, perceived: 'easy' },
      { ordinal: 2, points: 2, downgraded: false, eligibleFor3: true, perceived: 'moderate' },
      { ordinal: 3, points: 2, downgraded: false, eligibleFor3: true, perceived: 'hard' },
      { ordinal: 4, points: 3, downgraded: false, eligibleFor3: true, perceived: 'moderate' },
      { ordinal: 5, points: 2, downgraded: false, eligibleFor3: false, perceived: 'hard' },
    ]);
    expect(Object.fromEntries(result.points)).toEqual({ 1: 2, 2: 2, 3: 3, 4: 3, 5: 2 });
    expect(result.shortfall).toBe(0);
    expect(rebalancePoints([
      { ordinal: 1, points: 3, downgraded: true, eligibleFor3: false, perceived: 'easy' },
      { ordinal: 2, points: 2, downgraded: false, eligibleFor3: false, perceived: 'easy' },
    ]).shortfall).toBe(1);
  });

  it('gives 3-point slots statement formats when a 2-point statement slot can swap', () => {
    const modes: Parameters<typeof keepHighPointsOffLabelModes>[2] = ['pair_table', 'truth_combination', 'short_label', 'statement'];
    keepHighPointsOffLabelModes('success', [11, 12, 14, 15], modes, [3, 2, 3, 2]);
    expect(modes).toEqual(['truth_combination', 'pair_table', 'statement', 'short_label']);
    // 계산 특징 모듈이 있는 단원(공일 7단원 퍼트)은 그대로
    const calc: Parameters<typeof keepHighPointsOffLabelModes>[2] = ['short_label', 'statement'];
    keepHighPointsOffLabelModes('kongil', [7, 8], calc, [3, 2]);
    expect(calc).toEqual(['short_label', 'statement']);
  });

  it('builds review briefs with legal checks for law units and app-shaped questions', () => {
    const lawRequest = toPlanRequest({ subject: 'success', startUnit: 17, endUnit: 17, count: 1, difficulty: Difficulty.MIDDLE, seed: 'law' });
    const [spec] = planExam(lawRequest);
    const fakeQuestion = {
      targetConcept: spec.targetConcept.name, itemType: 'x', difficulty: spec.difficulty, recommendedTemplate: 'TPL_SOURCE_BLOCKS' as const,
      questionStem: '다음 자료에 대한 설명으로 옳은 것은?', stimulusData: { blocks: [{ type: 'text' as const, text: '자료' }], figures: {}, choice_table: null },
      optionsList: ['① 가', '② 나', '③ 다', '④ 라', '⑤ 마'], comboBlock: null, explanation: { judgment: '[해설] x' },
      correctAnswer: spec.answerIndex, points: spec.points, fingerprint: 'f',
    };
    expect(reviewBrief(spec, fakeQuestion as never).user).toContain('[법적 정합성 점검 항목]');
    expect(toAppQuestion(spec, fakeQuestion as never, 1)).toMatchObject({ orderIndex: 1, unitNumber: 17, recommendedTemplate: 'TPL_SOURCE_BLOCKS' });
  });
});
