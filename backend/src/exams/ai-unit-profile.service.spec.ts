import {
  AiUnitProfileService,
  buildGenerationProfile,
} from './ai-unit-profile.service';

function sourcePayload(overrides: Record<string, unknown> = {}) {
  return {
    source: { filename: 'unit-1.pdf', unitNumber: 1 },
    questionNumber: 1,
    stem: '다음 사례에 대한 설명으로 옳은 것은?',
    stimulus: 'A씨는 직무에 필요한 능력을 분석하였다.',
    choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
    correctAnswer: 1,
    targetConcepts: ['직무 분석'],
    ...overrides,
  };
}

describe('buildGenerationProfile', () => {
  it('aggregates certified sources by unit, concept, and supported family', () => {
    const profile = buildGenerationProfile(
      'success',
      1,
      2,
      [
        { unitName: '1단원', concepts: ['직무 분석', '직업 윤리'] },
        { unitName: '2단원', concepts: ['직업 윤리'] },
      ],
      [
        {
          logicalSourceId: 'source-1',
          contentHash: 'hash-1',
          subject: 'success',
          unitNumber: 1,
          sourcePayload: sourcePayload(),
        },
      ],
    );

    expect(profile.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unitNumber: 1,
          referenceCount: 1,
          certifiedReferenceCount: 1,
          familyCounts: { concept: 0, case: 1, calculation: 0 },
          supportedFamilies: ['case'],
        }),
        expect.objectContaining({
          unitNumber: 2,
          referenceCount: 0,
          certifiedReferenceCount: 0,
          supportedFamilies: [],
        }),
      ]),
    );
    expect(profile.units[0]?.concepts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: '직무 분석',
          certifiedReferenceCount: 1,
          familyCounts: { concept: 0, case: 1, calculation: 0 },
        }),
      ]),
    );
  });

  it('fails closed for unsupported source templates instead of recommending them', () => {
    const profile = buildGenerationProfile(
      'success',
      1,
      1,
      [{ unitName: '1단원', concepts: ['직무 분석'] }],
      [
        {
          logicalSourceId: 'source-1',
          contentHash: 'hash-1',
          subject: 'success',
          unitNumber: 1,
          sourcePayload: sourcePayload({
            stimulus: '| 구분 | 결과 |\n| 조건 | 값 |',
          }),
        },
      ],
    );

    expect(profile.units[0]).toEqual(
      expect.objectContaining({
        certifiedReferenceCount: 1,
        supportedFamilies: [],
        blockedReasons: ['UNSUPPORTED_SOURCE_TEMPLATE'],
      }),
    );
  });

  it('does not certify a source without an official answer', () => {
    const profile = buildGenerationProfile(
      'success',
      1,
      1,
      [{ unitName: '1단원', concepts: ['직무 분석'] }],
      [
        {
          logicalSourceId: 'source-1',
          contentHash: 'hash-1',
          subject: 'success',
          unitNumber: 1,
          sourcePayload: sourcePayload({ correctAnswer: null }),
        },
      ],
    );

    expect(profile.units[0]?.certifiedReferenceCount).toBe(0);
    expect(profile.units[0]?.supportedFamilies).toEqual([]);
  });

  it('keeps malformed catalog rows visible as blocked evidence', () => {
    const profile = buildGenerationProfile(
      'success',
      1,
      1,
      [{ unitName: '1단원', concepts: [] }],
      [
        {
          logicalSourceId: 'source-1',
          contentHash: 'hash-1',
          subject: 'success',
          unitNumber: 1,
          sourcePayload: { source: { filename: 'broken.pdf' } },
        },
      ],
    );

    expect(profile.units[0]).toEqual(
      expect.objectContaining({
        referenceCount: 1,
        certifiedReferenceCount: 0,
        blockedReasons: ['INVALID_SOURCE_PAYLOAD'],
      }),
    );
  });
});

describe('AiUnitProfileService persistence', () => {
  it('updates stale unit rows instead of inserting a duplicate unique key', async () => {
    const oldRow = {
      id: 'profile-1',
      subjectSlug: 'success',
      unitNumber: 1,
      profileVersion: 'v1',
      sourceFingerprint: 'stale-source',
      textbookFingerprint: 'stale-textbook',
      profile: {},
    };
    const save = jest.fn().mockResolvedValue([]);
    const service = new AiUnitProfileService(
      {
        find: jest.fn().mockResolvedValue([]),
      },
      {
        find: jest.fn().mockResolvedValue([oldRow]),
        save,
      },
      {
        getConcepts: jest
          .fn()
          .mockResolvedValue([{ unitName: '1단원', concepts: ['직무 분석'] }]),
      } as never,
    );

    await service.getProfile('success', 1, 1);

    expect(save).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'profile-1', unitNumber: 1 }),
    ]);
  });
});
