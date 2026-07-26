import { classifyReferenceArchetype } from './reference-archetype';
import type { ReferenceArchetype } from './reference-archetype';
import {
  AR_ARCHETYPE_FIXTURES,
  sourceArchetypeFixtureProjections,
  sourceArchetypeFixtureRecords,
  sourceArchetypeFixtureSummaries,
} from './reference-frame-planner.fixtures';

const EXPECTED_PROVENANCE = [
  'sungjik:15:1',
  'sungjik:15:2',
  'sungjik:15:3',
  'sungjik:15:4',
  'sungjik:15:5',
  'sungjik:15:6',
  'sungjik:15:7',
  'sungjik:15:8',
  'sungjik:15:9',
  'kongil:15:1',
  'kongil:15:2',
  'kongil:15:3',
  'kongil:15:4',
  'kongil:15:5',
  'kongil:15:6',
  'kongil:15:7',
  'kongil:15:8',
] as const;

type ExpectedClassification = Pick<
  ReferenceArchetype,
  | 'shell'
  | 'stimulusRole'
  | 'informationShape'
  | 'sourceTemplate'
  | 'responseMode'
  | 'choiceEncoding'
>;

const EXPECTED_CLASSIFICATIONS = [
  {
    shell: {
      kind: 'table',
      requiresStructuredSource: true,
      requiresViewBlock: true,
      requiresChoiceCombination: true,
    },
    stimulusRole: 'table',
    informationShape: 'comparison',
    sourceTemplate: 'TPL_COMPARATIVE_MATRIX',
    responseMode: 'truth_combination',
    choiceEncoding: 'truth_combination',
  },
  {
    shell: {
      kind: 'case',
      requiresStructuredSource: true,
      requiresViewBlock: true,
      requiresChoiceCombination: true,
    },
    stimulusRole: 'case',
    informationShape: 'case_profile',
    sourceTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
    responseMode: 'truth_combination',
    choiceEncoding: 'truth_combination',
  },
  {
    shell: {
      kind: 'timeline',
      requiresStructuredSource: true,
      requiresViewBlock: false,
      requiresChoiceCombination: false,
    },
    stimulusRole: 'timeline',
    informationShape: 'condition_flow',
    sourceTemplate: 'TPL_SEQUENTIAL_WORKFLOW',
    responseMode: 'single_selection',
    choiceEncoding: 'single_choice',
  },
  {
    shell: {
      kind: 'plain',
      requiresStructuredSource: false,
      requiresViewBlock: false,
      requiresChoiceCombination: false,
    },
    stimulusRole: 'prose',
    informationShape: 'case_profile',
    sourceTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
    responseMode: 'single_selection',
    choiceEncoding: 'single_choice',
  },
  {
    shell: {
      kind: 'table',
      requiresStructuredSource: true,
      requiresViewBlock: true,
      requiresChoiceCombination: true,
    },
    stimulusRole: 'table',
    informationShape: 'comparison',
    sourceTemplate: 'TPL_COMPARATIVE_MATRIX',
    responseMode: 'truth_combination',
    choiceEncoding: 'truth_combination',
  },
  {
    shell: {
      kind: 'dialogue',
      requiresStructuredSource: true,
      requiresViewBlock: false,
      requiresChoiceCombination: false,
    },
    stimulusRole: 'dialogue',
    informationShape: 'role_dialogue',
    sourceTemplate: 'TPL_CONVERSATIONAL_FLOW',
    responseMode: 'single_selection',
    choiceEncoding: 'single_choice',
  },
  {
    shell: {
      kind: 'case',
      requiresStructuredSource: true,
      requiresViewBlock: true,
      requiresChoiceCombination: true,
    },
    stimulusRole: 'case',
    informationShape: 'case_profile',
    sourceTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
    responseMode: 'truth_combination',
    choiceEncoding: 'truth_combination',
  },
  {
    shell: {
      kind: 'case',
      requiresStructuredSource: true,
      requiresViewBlock: true,
      requiresChoiceCombination: true,
    },
    stimulusRole: 'case',
    informationShape: 'case_profile',
    sourceTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
    responseMode: 'truth_combination',
    choiceEncoding: 'truth_combination',
  },
  {
    shell: {
      kind: 'plain',
      requiresStructuredSource: false,
      requiresViewBlock: false,
      requiresChoiceCombination: false,
    },
    stimulusRole: 'prose',
    informationShape: 'case_profile',
    sourceTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
    responseMode: 'single_selection',
    choiceEncoding: 'single_choice',
  },
  {
    shell: {
      kind: 'plain',
      requiresStructuredSource: false,
      requiresViewBlock: true,
      requiresChoiceCombination: true,
    },
    stimulusRole: 'prose',
    informationShape: 'comparison',
    sourceTemplate: 'TPL_COMPARATIVE_MATRIX',
    responseMode: 'truth_combination',
    choiceEncoding: 'truth_combination',
  },
  {
    shell: {
      kind: 'table',
      requiresStructuredSource: true,
      requiresViewBlock: true,
      requiresChoiceCombination: true,
    },
    stimulusRole: 'table',
    informationShape: 'comparison',
    sourceTemplate: 'TPL_COMPARATIVE_MATRIX',
    responseMode: 'truth_combination',
    choiceEncoding: 'truth_combination',
  },
  {
    shell: {
      kind: 'dialogue',
      requiresStructuredSource: true,
      requiresViewBlock: false,
      requiresChoiceCombination: false,
    },
    stimulusRole: 'dialogue',
    informationShape: 'role_dialogue',
    sourceTemplate: 'TPL_CONVERSATIONAL_FLOW',
    responseMode: 'single_selection',
    choiceEncoding: 'single_choice',
  },
  {
    shell: {
      kind: 'plain',
      requiresStructuredSource: false,
      requiresViewBlock: true,
      requiresChoiceCombination: true,
    },
    stimulusRole: 'prose',
    informationShape: 'comparison',
    sourceTemplate: 'TPL_COMPARATIVE_MATRIX',
    responseMode: 'truth_combination',
    choiceEncoding: 'truth_combination',
  },
  {
    shell: {
      kind: 'case',
      requiresStructuredSource: true,
      requiresViewBlock: true,
      requiresChoiceCombination: true,
    },
    stimulusRole: 'case',
    informationShape: 'case_profile',
    sourceTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
    responseMode: 'truth_combination',
    choiceEncoding: 'truth_combination',
  },
  {
    shell: {
      kind: 'plain',
      requiresStructuredSource: false,
      requiresViewBlock: true,
      requiresChoiceCombination: true,
    },
    stimulusRole: 'prose',
    informationShape: 'comparison',
    sourceTemplate: 'TPL_COMPARATIVE_MATRIX',
    responseMode: 'truth_combination',
    choiceEncoding: 'truth_combination',
  },
  {
    shell: {
      kind: 'table',
      requiresStructuredSource: true,
      requiresViewBlock: true,
      requiresChoiceCombination: true,
    },
    stimulusRole: 'table',
    informationShape: 'comparison',
    sourceTemplate: 'TPL_COMPARATIVE_MATRIX',
    responseMode: 'truth_combination',
    choiceEncoding: 'truth_combination',
  },
  {
    shell: {
      kind: 'plain',
      requiresStructuredSource: false,
      requiresViewBlock: false,
      requiresChoiceCombination: false,
    },
    stimulusRole: 'prose',
    informationShape: 'case_profile',
    sourceTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
    responseMode: 'single_selection',
    choiceEncoding: 'single_choice',
  },
] satisfies readonly ExpectedClassification[];

const EXPECTED_SHARED_SETS = [
  {
    setId: 'sungjik-rights-case-set-1',
    sourceIds: ['sungjik:15:7', 'sungjik:15:8'],
    shellKind: 'case_profile',
    allowedTplFamilies: ['TPL_CASE_DIAGNOSTIC_FRAME'],
  },
  {
    setId: 'kongil-paired-safety-set-1',
    sourceIds: ['kongil:15:3', 'kongil:15:4'],
    shellKind: 'prose',
    allowedTplFamilies: ['TPL_CASE_DIAGNOSTIC_FRAME'],
  },
] as const;

describe('reference archetype golden fixtures', () => {
  it('classifies every representative source family into deterministic structural summaries', () => {
    const summaries = sourceArchetypeFixtureSummaries();

    expect(summaries).toHaveLength(17);
    expect(
      summaries.map(
        (summary) =>
          `${summary.provenance.family}:${summary.provenance.unit}:${summary.provenance.questionNumber}`,
      ),
    ).toEqual([...EXPECTED_PROVENANCE]);
    expect(summaries.every((summary) => summary.conceptRoles.length > 0)).toBe(
      true,
    );
    expect(
      summaries.every((summary) => summary.evidence.evidenceOrder.length > 0),
    ).toBe(true);
    expect(
      summaries.every(
        (summary) => summary.register.allowedTplFamilies.length > 0,
      ),
    ).toBe(true);
    expect(summaries.every((summary) => !('stem' in summary))).toBe(true);
    expect(summaries.every((summary) => !('stimulus' in summary))).toBe(true);
    expect(summaries.every((summary) => !('viewItems' in summary))).toBe(true);
    expect(summaries.every((summary) => !('choices' in summary))).toBe(true);
  });

  it('reclassifies each fixture deterministically from the parsed source data', () => {
    const records = sourceArchetypeFixtureRecords();

    expect(records).toHaveLength(EXPECTED_CLASSIFICATIONS.length);

    records.forEach((record, index) => {
      const expected = EXPECTED_CLASSIFICATIONS[index];
      if (expected === undefined) return;

      const result = classifyReferenceArchetype(record);
      expect(result.kind).toBe('classified');
      if (result.kind !== 'classified') return;

      expect(result.value.shell).toEqual(expected.shell);
      expect(result.value.stimulusRole).toBe(expected.stimulusRole);
      expect(result.value.informationShape).toBe(expected.informationShape);
      expect(result.value.sourceTemplate).toBe(expected.sourceTemplate);
      expect(result.value.responseMode).toBe(expected.responseMode);
      expect(result.value.choiceEncoding).toBe(expected.choiceEncoding);
      expect(result.value.viewItemCount).toBe(record.viewItems.length);
      expect(result.value.choiceCount).toBe(record.choices.length);
      expect(result.value).not.toHaveProperty('stem');
      expect(result.value).not.toHaveProperty('stimulus');
      expect(result.value).not.toHaveProperty('viewItems');
      expect(result.value).not.toHaveProperty('choices');
    });
  });

  it('keeps the declared sungjik 15:5 structural expectation visible', () => {
    const projection = sourceArchetypeFixtureProjections()[4];

    expect(projection).toMatchObject({
      shell: {
        kind: 'table',
        requiresStructuredSource: true,
        requiresViewBlock: true,
        requiresChoiceCombination: true,
      },
      register: {
        stimulusRole: 'table',
        informationShape: 'comparison',
        allowedTplFamilies: ['TPL_COMPARATIVE_MATRIX'],
      },
      combinationPlan: {
        responseMode: 'truth_combination',
        choiceEncoding: 'truth_combination',
      },
    });
  });

  it('distinguishes the three source-faithful regression fixture classes', () => {
    const records = sourceArchetypeFixtureRecords();
    const fixtures = AR_ARCHETYPE_FIXTURES.map((fixture, index) => ({
      projection: fixture.projection,
      source: records[index],
    }));
    const fixtureBySourceId = new Map(
      fixtures.map((fixture) => [
        fixture.projection.provenance.sourceId,
        fixture,
      ]),
    );

    const combinationTable = fixtureBySourceId.get('sungjik:15:1');
    const documentConditionException = fixtureBySourceId.get('sungjik:15:9');
    const singleSelectionCase = fixtureBySourceId.get('kongil:15:8');

    expect(combinationTable).toMatchObject({
      projection: {
        shell: {
          kind: 'table',
          requiresViewBlock: true,
          requiresChoiceCombination: true,
        },
        combinationPlan: {
          responseMode: 'truth_combination',
          choiceEncoding: 'truth_combination',
        },
      },
    });
    expect(combinationTable?.source?.stimulus).toContain('| 종류 | 내용 |');
    expect(documentConditionException).toMatchObject({
      projection: {
        shell: {
          kind: 'document',
          requiresStructuredSource: true,
          requiresViewBlock: false,
        },
        register: { informationShape: 'document_rules' },
        distractorTransforms: expect.arrayContaining(['exception_hypothesis']),
        combinationPlan: {
          responseMode: 'single_selection',
          choiceEncoding: 'single_choice',
        },
      },
    });
    expect(documentConditionException?.source?.stem).toContain('(단,');
    expect(singleSelectionCase).toMatchObject({
      projection: {
        shell: {
          kind: 'prose',
          requiresViewBlock: false,
          requiresChoiceCombination: false,
        },
        register: {
          informationShape: 'case_profile',
        },
        combinationPlan: {
          responseMode: 'single_selection',
          choiceEncoding: 'single_choice',
        },
      },
    });
    expect(singleSelectionCase?.source?.stem).toContain('사고 예방 5단계');
  });

  it('preserves both shared-document fixture set contracts', () => {
    EXPECTED_SHARED_SETS.forEach((expectedSet) => {
      const sharedPair = AR_ARCHETYPE_FIXTURES.filter(
        (fixture) => fixture.projection.sharedSet?.setId === expectedSet.setId,
      );

      expect(sharedPair).toHaveLength(2);
      expect(
        sharedPair.map((fixture) => fixture.projection.provenance.sourceId),
      ).toEqual(expectedSet.sourceIds);
      expect(
        sharedPair.map((fixture) => fixture.projection.sharedSet?.setId),
      ).toEqual([expectedSet.setId, expectedSet.setId]);
      expect(
        sharedPair.map((fixture) => fixture.projection.sharedSet?.role),
      ).toEqual(['shared_primary', 'shared_pair']);
      expect(
        sharedPair.map((fixture) => fixture.projection.shell.kind),
      ).toEqual([expectedSet.shellKind, expectedSet.shellKind]);
      expect(
        sharedPair.map(
          (fixture) => fixture.projection.register.allowedTplFamilies,
        ),
      ).toEqual([
        expectedSet.allowedTplFamilies,
        expectedSet.allowedTplFamilies,
      ]);
    });
  });

  it('keeps public fixture projections raw-prose free', () => {
    AR_ARCHETYPE_FIXTURES.forEach((fixture) => {
      expect(fixture.projection).not.toHaveProperty('stem');
      expect(fixture.projection).not.toHaveProperty('stimulus');
      expect(fixture.projection).not.toHaveProperty('viewItems');
      expect(fixture.projection).not.toHaveProperty('choices');
    });
  });
});
