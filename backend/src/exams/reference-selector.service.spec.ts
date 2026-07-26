import {
  DEFAULT_DISTRACTOR_AXES,
  selectReferences,
  type ReferenceSelectorRequest,
} from './reference-selector.service';
import {
  isReferenceSourceEligible,
  parseReference,
} from './reference-selector.utils';

function validRequest(
  overrides: Partial<ReferenceSelectorRequest> = {},
): ReferenceSelectorRequest {
  return {
    subject: 'success',
    unitRange: { start: 1, end: 2 },
    requestedConcepts: ['Career values'],
    requestedDistractorAxes: [DEFAULT_DISTRACTOR_AXES[0]],
    requestedReferenceCount: 2,
    seed: 'reference-selector-seed',
    unitConcepts: [
      { unitName: '1단원', concepts: ['Career values', 'Work ethics'] },
      { unitName: '2단원', concepts: ['Career planning'] },
    ],
    parsedReferences: [
      validReference(1, 1, 'Career values'),
      validReference(2, 1, 'Career planning'),
      validReference(2, 2, 'Work ethics'),
    ],
    ...overrides,
  };
}

function validReference(
  unitNumber: number,
  questionNumber: number,
  targetConcept: string,
): unknown {
  return {
    source: {
      filename: `unit-${unitNumber}.pdf`,
      unitNumber,
    },
    questionNumber,
    stem: `Question ${questionNumber} for unit ${unitNumber}`,
    stimulus: `Reference stimulus for unit ${unitNumber} question ${questionNumber}`,
    choices: ['one', 'two', 'three', 'four', 'five'],
    targetConcepts: [targetConcept],
  };
}

describe('selectReferences', () => {
  it('accepts non-empty shared-set primaries and empty-stimulus shared pairs', () => {
    const primary = parseReference(
      {
        source: { filename: 'shared-set.pdf', unitNumber: 15 },
        questionNumber: 3,
        stem: '다음 보고서에 대한 설명으로 옳은 것은?',
        stimulus: '[3~4] 다음은 안전 보고서이다.',
        choices: ['one', 'two', 'three', 'four', 'five'],
        targetConcepts: ['Safety'],
      },
      'success',
    );
    const pair = parseReference(
      {
        source: { filename: 'shared-set.pdf', unitNumber: 15 },
        questionNumber: 4,
        stem: '위 보고서를 통해 알 수 있는 내용으로 옳은 것은?',
        stimulus: '',
        choices: ['one', 'two', 'three', 'four', 'five'],
        targetConcepts: ['Safety'],
      },
      'success',
    );

    expect(primary).toMatchObject({
      ok: true,
      value: { archetype: { setStructure: { position: 'shared_primary' } } },
    });
    expect(pair).toMatchObject({
      ok: true,
      value: {
        stimulus: '',
        archetype: { setStructure: { position: 'shared_pair' } },
      },
    });
  });

  it('rejects an empty stimulus for a non-shared source', () => {
    const result = parseReference(
      {
        source: { filename: 'standalone.pdf', unitNumber: 15 },
        questionNumber: 1,
        stem: '다음 중 옳은 것은?',
        stimulus: '',
        choices: ['one', 'two', 'three', 'four', 'five'],
        targetConcepts: ['Safety'],
      },
      'success',
    );

    expect(result).toEqual({ ok: false });
  });

  it('rejects an audited source with incomplete persisted context', () => {
    const sourceId = 'success:10:성직_10단원_문제.pdf:10';
    const result = parseReference(
      {
        source: { filename: '성직_10단원_문제.pdf', unitNumber: 10 },
        questionNumber: 10,
        stem: '다음은 국가직무능력표준(NCS)을 통해 전공별 직무 능력을 탐색한 화면이다.',
        stimulus:
          '키워드 | 코드 | NCS | 분류보기 | 기술서 출력\n23. 환경·에너지·안전',
        viewItems: ['ㄱ. 직무는 4가지가 제시되어 있다.'],
        choices: ['① ㄱ', '② ㄴ', '③ ㄷ', '④ ㄹ', '⑤ ㅁ'],
        targetConcepts: ['국가직무능력표준(NCS)'],
      },
      'success',
    );

    expect(isReferenceSourceEligible(sourceId)).toBe(false);
    expect(result).toEqual({ ok: false });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, 0, -1])(
    'Given requested count %i, When selecting before planning, Then returns an invalid-count shortfall without calling the planner',
    (requestedReferenceCount) => {
      const planner = jest.fn();
      const result = selectReferences(
        validRequest({ requestedReferenceCount }),
      );

      if (result.kind === 'selected') {
        planner(result);
      }

      expect(result).toEqual({
        kind: 'shortfall',
        shortfall: expect.objectContaining({
          requestedReferenceCount,
          availableReferenceCount: 0,
          reasons: expect.arrayContaining([
            'INVALID_REQUESTED_REFERENCE_COUNT',
          ]),
        }),
      });
      expect(planner).not.toHaveBeenCalled();
    },
  );

  it('Given a concept outside the selected range, When selecting, Then returns a typed out-of-range shortfall', () => {
    const result = selectReferences(
      validRequest({
        requestedConcepts: ['Archived concept'],
        unitConcepts: [
          { unitName: '1단원', concepts: ['Career values'] },
          { unitName: '3단원', concepts: ['Archived concept'] },
        ],
      }),
    );

    expect(result).toEqual({
      kind: 'shortfall',
      shortfall: expect.objectContaining({
        reasons: expect.arrayContaining(['CONCEPT_OUT_OF_RANGE']),
      }),
    });
  });

  it('Given an alias that only partially matches a selected concept, When selecting, Then rejects the ambiguous alias', () => {
    const result = selectReferences(
      validRequest({ requestedConcepts: ['Career'] }),
    );

    expect(result).toEqual({
      kind: 'shortfall',
      shortfall: expect.objectContaining({
        reasons: expect.arrayContaining(['CONCEPT_NOT_CANONICAL']),
      }),
    });
  });

  it('Given a source with canonical and supporting targets, When selecting for the first target, Then treats the first target as eligible', () => {
    const result = selectReferences(
      validRequest({
        requestedReferenceCount: 1,
        requestedConcepts: ['Canonical source concept'],
        eligibleReferenceConcepts: ['Canonical source concept'],
        unitConcepts: [
          {
            unitName: '1단원',
            concepts: ['Canonical source concept', 'Supporting concept'],
          },
        ],
        parsedReferences: [
          {
            source: { filename: 'multi-concept.pdf', unitNumber: 1 },
            questionNumber: 1,
            stem: 'Question with a canonical and supporting source concept',
            stimulus: 'Reference stimulus with a canonical decision rule.',
            choices: ['one', 'two', 'three', 'four', 'five'],
            targetConcepts: ['Canonical source concept', 'Supporting concept'],
          },
        ],
      }),
    );

    expect(result.kind).toBe('selected');
  });

  it('Given a source with multiple targets, When parsing, Then normalizes its first target into one immutable source target', () => {
    const result = parseReference(
      {
        source: { filename: 'multi-concept.pdf', unitNumber: 1 },
        questionNumber: 1,
        stem: 'Question with a canonical and supporting source concept',
        stimulus: 'Reference stimulus with a canonical decision rule.',
        choices: ['one', 'two', 'three', 'four', 'five'],
        targetConcepts: ['Canonical source concept', 'Supporting concept'],
      },
      'success',
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          target: {
            primaryConcept: 'Canonical source concept',
            concepts: ['Canonical source concept'],
          },
        }),
      }),
    );
  });

  it.each([
    ['missing', {}],
    ['blank', { targetConcepts: ['   '] }],
  ] as const)(
    'Given a $case source target, When parsing, Then returns the typed rejection variant',
    (_case, target) => {
      const result = parseReference(
        {
          source: { filename: 'invalid-target.pdf', unitNumber: 1 },
          questionNumber: 1,
          stem: 'Question with an invalid source target',
          stimulus: 'Reference stimulus with a canonical decision rule.',
          choices: ['one', 'two', 'three', 'four', 'five'],
          ...target,
        },
        'success',
      );

      expect(result).toEqual({ ok: false });
    },
  );

  it('Given a caller filter that matches only a supporting source label, When selecting, Then rejects the reference because it excludes the canonical target', () => {
    const result = selectReferences(
      validRequest({
        requestedReferenceCount: 1,
        requestedConcepts: ['Supporting concept'],
        eligibleReferenceConcepts: ['Supporting concept'],
        unitConcepts: [
          {
            unitName: '1단원',
            concepts: ['Canonical source concept', 'Supporting concept'],
          },
        ],
        parsedReferences: [
          {
            source: { filename: 'multi-concept.pdf', unitNumber: 1 },
            questionNumber: 1,
            stem: 'Question with a canonical and supporting source concept',
            stimulus: 'Reference stimulus with a canonical decision rule.',
            choices: ['one', 'two', 'three', 'four', 'five'],
            targetConcepts: ['Canonical source concept', 'Supporting concept'],
          },
        ],
      }),
    );

    expect(result).toEqual({
      kind: 'shortfall',
      shortfall: expect.objectContaining({
        reasons: expect.arrayContaining(['SOURCE_TARGET_EXCLUDED']),
      }),
    });
  });

  it('Given duplicate parsed sources, When selecting references, Then returns unique source identities', () => {
    const result = selectReferences(
      validRequest({
        parsedReferences: [
          validReference(1, 1, 'Career values'),
          validReference(1, 1, 'Career values'),
          validReference(2, 1, 'Career planning'),
        ],
      }),
    );

    expect(result.kind).toBe('selected');
    if (result.kind !== 'selected') {
      return;
    }

    expect(result.references).toHaveLength(2);
    expect(
      new Set(result.references.map((reference) => reference.source.sourceId))
        .size,
    ).toBe(2);
  });

  it('Given letter-only choices without a view block, When selecting references, Then rejects the ambiguous source', () => {
    const result = selectReferences(
      validRequest({
        parsedReferences: [
          {
            source: { filename: 'ambiguous.pdf', unitNumber: 1 },
            questionNumber: 1,
            stem: '다음 중 옳은 것은?',
            stimulus: '근로 시간 관련 조항이다.',
            viewItems: [],
            choices: ['① ㄱ', '② ㄴ', '③ ㄷ', '④ ㄹ', '⑤ 모두 옳다'],
            targetConcepts: ['Career values'],
          },
          validReference(2, 1, 'Career planning'),
        ],
      }),
    );

    expect(result).toEqual({
      kind: 'shortfall',
      shortfall: expect.objectContaining({
        reasons: expect.arrayContaining(['INSUFFICIENT_REFERENCES']),
      }),
    });
  });

  it('Given contiguous ㄱㄴㄷ lines embedded in a stimulus, When selecting references, Then extracts them as a view block', () => {
    const result = selectReferences(
      validRequest({
        requestedReferenceCount: 1,
        parsedReferences: [
          {
            source: { filename: 'embedded-view.pdf', unitNumber: 1 },
            questionNumber: 1,
            stem: '다음 자료에 대한 설명으로 옳은 것만을 <보기>에서 고른 것은?',
            stimulus:
              '근로 조건을 비교한 자료이다.\n\nㄱ. 첫 번째 판단\nㄴ. 두 번째 판단\nㄷ. 세 번째 판단',
            viewItems: [],
            choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
            targetConcepts: ['Career values'],
          },
        ],
      }),
    );

    expect(result.kind).toBe('selected');
    if (result.kind !== 'selected') return;
    expect(result.references[0]).toMatchObject({
      stimulus: '근로 조건을 비교한 자료이다.',
      viewItems: ['ㄱ. 첫 번째 판단', 'ㄴ. 두 번째 판단', 'ㄷ. 세 번째 판단'],
      archetype: { responseMode: 'truth_combination' },
    });
  });

  it('Given the same seed and equivalent references, When selecting twice, Then returns the same ordered assignment', () => {
    const request = validRequest();

    const first = selectReferences(request);
    const second = selectReferences({
      ...request,
      parsedReferences: [...request.parsedReferences].reverse(),
    });

    expect(second).toEqual(first);
  });

  it('Given generation requests the replacement pool, When selecting equivalent references, Then returns every eligible source in stable order', () => {
    const request = validRequest({
      requestedReferenceCount: 1,
      includeAllEligibleReferences: true,
    });
    const first = selectReferences(request);
    const second = selectReferences({
      ...request,
      parsedReferences: [...request.parsedReferences].reverse(),
    });

    expect(first.kind).toBe('selected');
    expect(second).toEqual(first);
    if (first.kind === 'selected') {
      expect(first.references).toHaveLength(3);
    }
  });

  it('Given an axis outside the catalog, When selecting, Then returns a typed axis shortfall', () => {
    const result = selectReferences(
      validRequest({ requestedDistractorAxes: ['unsupported_axis'] }),
    );

    expect(result).toEqual({
      kind: 'shortfall',
      shortfall: expect.objectContaining({
        reasons: expect.arrayContaining(['AXIS_NOT_ALLOWED']),
      }),
    });
  });

  it('Given a parsed reference without a stimulus or five choices, When selecting, Then rejects it before assignment', () => {
    const result = selectReferences(
      validRequest({
        requestedReferenceCount: 1,
        parsedReferences: [
          {
            source: { filename: 'invalid.pdf', unitNumber: 1 },
            questionNumber: 1,
            stem: 'A malformed reference',
            stimulus: '',
            choices: ['one', 'two'],
            targetConcepts: ['Career values'],
          },
        ],
      }),
    );

    expect(result).toEqual({
      kind: 'shortfall',
      shortfall: expect.objectContaining({
        reasons: expect.arrayContaining(['INVALID_REFERENCE']),
      }),
    });
  });

  it('Given fewer valid unique references than requested, When selecting before planning, Then returns a shortfall without calling the planner', () => {
    const planner = jest.fn();
    const result = selectReferences(
      validRequest({
        requestedReferenceCount: 4,
        parsedReferences: [validReference(1, 1, 'Career values')],
      }),
    );

    if (result.kind === 'selected') {
      planner(result);
    }

    expect(result).toEqual({
      kind: 'shortfall',
      shortfall: expect.objectContaining({
        requestedReferenceCount: 4,
        availableReferenceCount: 1,
        reasons: expect.arrayContaining(['INSUFFICIENT_REFERENCES']),
      }),
    });
    expect(planner).not.toHaveBeenCalled();
  });
});
