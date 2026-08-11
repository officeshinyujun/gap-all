import { Difficulty } from '../entities/exam-record.entity';
import {
  compileAiBlueprints,
  isSupportedCaseArchetype,
} from './ai-blueprint.service';

const profile = {
  subjectSlug: 'success',
  profileVersion: 'v1',
  units: [],
} as const;

const evidence = [
  {
    sourceId: 'success:1:source-a.pdf:1',
    sourceHash: 'fnv1a:a',
    unitNumber: 1,
    concept: '직무 분석',
    family: 'case' as const,
    template: 'TPL_CASE_DIAGNOSTIC_FRAME',
  },
  {
    sourceId: 'success:1:source-b.pdf:2',
    sourceHash: 'fnv1a:b',
    unitNumber: 1,
    concept: '직업 윤리',
    family: 'concept' as const,
    template: 'TPL_CONVERSATION',
  },
  {
    sourceId: 'success:1:source-c.pdf:3',
    sourceHash: 'fnv1a:c',
    unitNumber: 1,
    concept: '직업 윤리 2',
    family: 'concept' as const,
    template: 'TPL_CASE_DIAGNOSTIC_FRAME',
  },
  {
    sourceId: 'success:1:source-d.pdf:4',
    sourceHash: 'fnv1a:d',
    unitNumber: 1,
    concept: '직업 윤리 3',
    family: 'concept' as const,
    template: 'TPL_CASE_DIAGNOSTIC_FRAME',
  },
  {
    sourceId: 'success:1:source-e.pdf:5',
    sourceHash: 'fnv1a:e',
    unitNumber: 1,
    concept: '직업 윤리 4',
    family: 'concept' as const,
    template: 'TPL_CASE_DIAGNOSTIC_FRAME',
  },
];

describe('compileAiBlueprints', () => {
  it('creates deterministic, server-owned answer-rule blueprints', () => {
    const request = {
      subjectId: '5d0199c5-6bf6-4a92-a3f8-dbd8679bf9e7',
      difficulty: Difficulty.MIDDLE,
      questionCount: 1,
      seed: 'stable-seed',
    } as const;

    const first = compileAiBlueprints(profile, evidence, request);
    const second = compileAiBlueprints(profile, evidence, request);

    expect(first).toEqual(second);
    expect(first.blueprints).toHaveLength(1);
    expect(first.blueprints[0]).toEqual(
      expect.objectContaining({
        subjectId: request.subjectId,
        blueprintVersion: 'v3',
        sourceEvidence: [
          expect.objectContaining({
            sourceId: expect.stringContaining('success:1:'),
          }),
        ],
        answerRule: expect.objectContaining({ id: 'concept-match-v1' }),
      }),
    );
    expect(first.blueprints[0]).not.toHaveProperty('correctAnswer');
    expect(first.reserveCount).toBe(0);
  });

  it('does not report shortfall when fallback blueprints exceed the request', () => {
    const result = compileAiBlueprints(profile, evidence, {
      subjectId: '5d0199c5-6bf6-4a92-a3f8-dbd8679bf9e7',
      difficulty: Difficulty.MIDDLE,
      questionCount: 1,
      candidateCount: 2,
      aiQuestionFamily: 'concept',
    });

    expect(result.blueprints).toHaveLength(2);
    expect(result.shortfall).toBeUndefined();
  });

  it('filters by requested family and returns a safe shortfall', () => {
    const result = compileAiBlueprints(profile, evidence, {
      subjectId: '5d0199c5-6bf6-4a92-a3f8-dbd8679bf9e7',
      difficulty: Difficulty.HIGH,
      questionCount: 2,
      aiQuestionFamily: 'calculation',
    });

    expect(result.blueprints).toEqual([]);
    expect(result.shortfall).toEqual({
      requestedCount: 2,
      availableCount: 0,
      reason: 'UNSUPPORTED_FAMILY',
    });
  });

  it('does not reuse one source for multiple blueprints', () => {
    const result = compileAiBlueprints(profile, [evidence[0], evidence[0]], {
      subjectId: '5d0199c5-6bf6-4a92-a3f8-dbd8679bf9e7',
      difficulty: Difficulty.LOW,
      questionCount: 2,
    });

    expect(result.blueprints).toHaveLength(0);
    expect(result.shortfall?.reason).toBe('INSUFFICIENT_CERTIFIED_EVIDENCE');
  });

  it('uses textbook concepts as verified distractor candidates', () => {
    const result = compileAiBlueprints(
      {
        subjectSlug: 'success',
        profileVersion: 'v1',
        units: [
          {
            unitNumber: 1,
            unitName: '1단원',
            referenceCount: 1,
            certifiedReferenceCount: 1,
            familyCounts: { concept: 0, case: 1, calculation: 0 },
            supportedFamilies: ['case'],
            blockedReasons: [],
            concepts: [
              ...['직업 윤리', '직업 훈련', '인사 평가', '경력 개발'].map(
                (name) => ({
                  name,
                  certifiedReferenceCount: 0,
                  familyCounts: { concept: 0, case: 0, calculation: 0 },
                  supportedFamilies: [],
                  blockedReasons: [],
                }),
              ),
            ],
          },
        ],
      },
      [evidence[0]],
      {
        subjectId: '5d0199c5-6bf6-4a92-a3f8-dbd8679bf9e7',
        difficulty: Difficulty.MIDDLE,
        questionCount: 1,
        aiQuestionFamily: 'case',
      },
    );

    expect(result.blueprints).toHaveLength(1);
    expect(result.blueprints[0]?.distractorConcepts).toHaveLength(4);
  });

  it('excludes prior source ids and keeps selection within concept quota', () => {
    const result = compileAiBlueprints(profile, evidence, {
      subjectId: '5d0199c5-6bf6-4a92-a3f8-dbd8679bf9e7',
      difficulty: Difficulty.MIDDLE,
      questionCount: 2,
      excludeSourceIds: [evidence[0].sourceId],
    });

    expect(result.blueprints.every((item) =>
      item.sourceEvidence.every(
        (source) => source.sourceId !== evidence[0].sourceId,
      ),
    )).toBe(true);
  });

  it('allocates clustered sources by unit and TPL before using variants', () => {
    const clustered = [
      ...['a', 'b', 'c'].map((id, index) => ({
        ...evidence[0],
        sourceId: `source-${id}`,
        baseSourceId: `source-${id}`,
        concept: evidence[index]?.concept ?? evidence[0].concept,
        template: 'TPL_ARTICLE',
        unitNumber: 1,
      })),
      {
        ...evidence[0],
        sourceId: 'source-d',
        baseSourceId: 'source-d',
        concept: evidence[3].concept,
        template: 'TPL_COMPARATIVE_MATRIX',
        unitNumber: 2,
      },
      {
        ...evidence[0],
        sourceId: 'source-e',
        baseSourceId: 'source-e',
        concept: evidence[4].concept,
        template: 'TPL_ARTICLE',
        unitNumber: 1,
      },
    ];
    const result = compileAiBlueprints(profile, clustered, {
      subjectId: '5d0199c5-6bf6-4a92-a3f8-dbd8679bf9e7',
      difficulty: Difficulty.MIDDLE,
      questionCount: 3,
      candidateCount: 3,
      seed: 'tpl-round-robin',
    });

    expect(result.blueprints.map((item) => item.template)).toEqual([
      'TPL_ARTICLE',
      'TPL_COMPARATIVE_MATRIX',
      'TPL_ARTICLE',
    ]);
  });

  it('keeps a replacement reserve after the primary allocation', () => {
    const result = compileAiBlueprints(profile, [
      ...evidence.map((item, index) => ({
        ...item,
        sourceId: `reserve-${index}`,
        baseSourceId: `reserve-${index}`,
        template: index % 2 === 0 ? 'TPL_ARTICLE' : 'TPL_FORMAL_DOCUMENT',
        caseContext: '원문 사실',
      })),
    ], {
      subjectId: 'subject-1',
      difficulty: Difficulty.MIDDLE,
      questionCount: 2,
      candidateCount: 7,
      seed: 'reserve',
    });

    expect(result.blueprints).toHaveLength(5);
    expect(result.blueprints.slice(2)).toHaveLength(3);
    expect(Object.values(result.reserveByTpl).reduce((sum, count) => sum + count, 0)).toBe(3);
  });

});

describe('isSupportedCaseArchetype', () => {
  it('keeps both legacy single-selection and verified truth-combination references', () => {
    expect(
      isSupportedCaseArchetype({
        sourceTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
        responseMode: 'single_selection',
        choiceTopology: 'single_choice',
        stemIntent: 'positive_single_selection',
      } as never),
    ).toBe(true);
    expect(
      isSupportedCaseArchetype({
        sourceTemplate: 'TPL_COMPARATIVE_MATRIX',
        responseMode: 'truth_combination',
        choiceTopology: 'combo_sets',
        stemIntent: 'truth_combination',
      } as never),
    ).toBe(true);
    expect(
      isSupportedCaseArchetype({
        sourceTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
        responseMode: 'truth_combination',
        choiceTopology: 'combo_sets',
        stemIntent: 'truth_combination',
      } as never),
    ).toBe(true);
    expect(
      isSupportedCaseArchetype({
        sourceTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
        responseMode: 'single_selection',
        choiceTopology: 'combo_sets',
        stemIntent: 'positive_single_selection',
      } as never),
    ).toBe(false);
  });
});
