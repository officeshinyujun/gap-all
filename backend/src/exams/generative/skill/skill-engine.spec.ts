import { Difficulty } from '../../../entities/difficulty';
import {
  checkCandidate,
  judgeReview,
  planExam,
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
