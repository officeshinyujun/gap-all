import { classifyReferenceArchetype } from './reference-archetype';
import {
  buildReferenceFidelitySpec,
  parseReferenceFidelitySpec,
  REFERENCE_FIDELITY_SPEC_VERSION,
  validateReferenceFidelitySpec,
  type ReferenceFidelityDetails,
  type ReferenceFidelitySource,
  type ReferenceFidelitySpec,
} from './reference-fidelity-spec';
import { AR_ARCHETYPE_FIXTURES } from './reference-frame-planner.fixtures';

type FidelityFixture = Readonly<{
  sourceId: string;
  sourceHash: string;
  targetConcept: string;
  targetConceptId: string;
  minimumStimulusLength: number;
  response: ReferenceFidelitySpec['response'];
}>;

const FIDELITY_FIXTURES = [
  {
    sourceId: 'sungjik:15:1',
    sourceHash: 'hash-combination-table',
    targetConcept: '근로관계법',
    targetConceptId: 'concept_labor_relations',
    minimumStimulusLength: 100,
    response: {
      choiceCount: 5,
      viewItemCount: 3,
      choiceTopology: 'combo_sets',
      responseMode: 'truth_combination',
    },
  },
  {
    sourceId: 'sungjik:15:9',
    sourceHash: 'hash-condition-exception-document',
    targetConcept: '해고 예고',
    targetConceptId: 'concept_dismissal_notice',
    minimumStimulusLength: 100,
    response: {
      choiceCount: 5,
      viewItemCount: 0,
      choiceTopology: 'single_choice',
      responseMode: 'single_selection',
    },
  },
  {
    sourceId: 'kongil:15:8',
    sourceHash: 'hash-single-selection-case',
    targetConcept: '사고 예방 5단계',
    targetConceptId: 'concept_accident_prevention_steps',
    minimumStimulusLength: 0,
    response: {
      choiceCount: 5,
      viewItemCount: 0,
      choiceTopology: 'single_choice',
      responseMode: 'single_selection',
    },
  },
] as const satisfies readonly FidelityFixture[];

function sourceFixture(sourceId: string) {
  const fixture = AR_ARCHETYPE_FIXTURES.find(
    ({ projection }) => projection.provenance.sourceId === sourceId,
  );
  if (fixture === undefined) {
    throw new Error(`Missing source fixture: ${sourceId}`);
  }
  return fixture;
}

function completeDetails(
  targetConceptId: string,
  optionCount: number,
): ReferenceFidelityDetails {
  return {
    structureBlueprint: {
      informationUnits: [
        { id: 'fact_context', order: 1, kind: 'context', atomIds: ['atom_1'] },
        {
          id: 'fact_condition',
          order: 2,
          kind: 'condition',
          atomIds: ['atom_2'],
        },
        {
          id: 'fact_conclusion',
          order: 3,
          kind: 'conclusion',
          atomIds: ['atom_3'],
        },
      ],
      relations: [
        {
          kind: 'condition_of',
          fromUnitId: 'fact_condition',
          toUnitId: 'fact_conclusion',
        },
      ],
      reasoningSteps: [
        {
          id: 'step_apply_condition',
          order: 1,
          operation: 'derive_conclusion',
          unitIds: ['fact_condition', 'fact_conclusion'],
          dependsOnStepIds: [],
        },
      ],
      itemRoles: Array.from({ length: optionCount }, (_, index) => ({
        itemKind: 'choice' as const,
        itemIndex: index + 1,
        role: index === 0 ? ('correct' as const) : ('irrelevant' as const),
        unitIds: [index === 0 ? 'fact_conclusion' : 'fact_context'],
        reasoningStepIds: ['step_apply_condition'],
      })),
      evidenceBlocks: [],
    },
    answerPlan: {
      responseMode:
        optionCount === 5 ? 'single_selection' : 'truth_combination',
      choiceEncoding: optionCount === 5 ? 'single_choice' : 'truth_combination',
      expectedAnswerCount: optionCount,
      options: Array.from({ length: optionCount }, (_, index) => ({
        id: `option_${index + 1}`,
        verdict: index === 0,
        atomIds: [`atom_${index + 1}`],
      })),
    },
    targetConceptIds: [targetConceptId],
    allowedTerminology: ['근로자', '조건'],
  };
}

function fixtureSpec(fixture: FidelityFixture): Readonly<{
  source: ReferenceFidelitySource;
  spec: ReferenceFidelitySpec;
}> {
  const source = sourceFixture(fixture.sourceId);
  const archetype = classifyReferenceArchetype({
    ...source.source,
    targetConcepts: [fixture.targetConcept],
  });
  if (archetype.kind !== 'classified') {
    throw new Error(`Fixture did not classify: ${fixture.sourceId}`);
  }
  const optionCount =
    archetype.value.responseMode === 'truth_combination'
      ? archetype.value.viewItemCount
      : archetype.value.choiceCount;
  const fidelitySource: ReferenceFidelitySource = {
    source: { sourceId: fixture.sourceId, sourceHash: fixture.sourceHash },
    ...source.source,
    targetConcepts: [fixture.targetConcept],
  };
  return {
    source: fidelitySource,
    spec: buildReferenceFidelitySpec(
      fidelitySource,
      archetype.value,
      completeDetails(fixture.targetConceptId, optionCount),
    ),
  };
}

function expectedContract(
  source: ReferenceFidelitySource,
  spec: ReferenceFidelitySpec,
  targetConceptId: string,
) {
  return {
    source: source.source,
    version: REFERENCE_FIDELITY_SPEC_VERSION,
    targetConceptIds: [targetConceptId],
    response: spec.response,
  };
}

describe('ReferenceFidelitySpec', () => {
  it.each(FIDELITY_FIXTURES)(
    'builds and validates the complete contract for $sourceId',
    (fixture) => {
      const { source, spec } = fixtureSpec(fixture);

      expect(spec.source).toEqual(source.source);
      expect(spec.targetConcepts).toEqual([fixture.targetConcept]);
      expect(spec.targetConceptIds).toEqual([fixture.targetConceptId]);
      expect(spec.response).toEqual(fixture.response);
      expect(spec.density.stimulusLength).toBeGreaterThanOrEqual(
        fixture.minimumStimulusLength,
      );
      expect(spec.structure.relations).toEqual([
        {
          kind: 'condition_of',
          fromUnitId: 'fact_condition',
          toUnitId: 'fact_conclusion',
        },
      ]);
      expect(spec.structure.optionMappings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            itemIndex: 1,
            verdict: true,
            role: 'correct',
            unitIds: ['fact_conclusion'],
            reasoningStepIds: ['step_apply_condition'],
          }),
        ]),
      );
      expect(parseReferenceFidelitySpec(spec)).toEqual({
        ok: true,
        value: spec,
      });
      expect(
        validateReferenceFidelitySpec(
          spec,
          expectedContract(source, spec, fixture.targetConceptId),
        ),
      ).toEqual({ kind: 'accepted' });
    },
  );

  it('rejects stale versions and changed source identities', () => {
    const fixture = FIDELITY_FIXTURES[0];
    if (fixture === undefined) throw new Error('Missing fidelity fixture.');
    const { source, spec } = fixtureSpec(fixture);

    expect(
      validateReferenceFidelitySpec(spec, {
        ...expectedContract(source, spec, fixture.targetConceptId),
        version: REFERENCE_FIDELITY_SPEC_VERSION + 1,
      }),
    ).toEqual({
      kind: 'rejected',
      error: { code: 'STALE_CONTRACT_VERSION', path: 'version' },
    });
    expect(
      validateReferenceFidelitySpec(spec, {
        ...expectedContract(source, spec, fixture.targetConceptId),
        source: { ...source.source, sourceHash: 'stale-hash' },
      }),
    ).toEqual({
      kind: 'rejected',
      error: { code: 'SOURCE_MISMATCH', path: 'source' },
    });
  });

  it('rejects an unknown target concept and a changed response topology', () => {
    const fixture = FIDELITY_FIXTURES[1];
    if (fixture === undefined) throw new Error('Missing fidelity fixture.');
    const { source, spec } = fixtureSpec(fixture);

    expect(
      validateReferenceFidelitySpec(spec, {
        ...expectedContract(source, spec, fixture.targetConceptId),
        targetConceptIds: ['concept_unknown'],
      }),
    ).toEqual({
      kind: 'rejected',
      error: {
        code: 'UNKNOWN_TARGET_CONCEPT',
        path: 'targetConceptIds[0]',
      },
    });
    expect(
      validateReferenceFidelitySpec(
        {
          ...spec,
          response: { ...spec.response, choiceTopology: 'combo_sets' },
        },
        expectedContract(source, spec, fixture.targetConceptId),
      ),
    ).toEqual({
      kind: 'rejected',
      error: { code: 'RESPONSE_TOPOLOGY_MISMATCH', path: 'response' },
    });
  });

  it('rejects duplicate units, unknown or cyclic relations, and incomplete option maps', () => {
    const fixture = FIDELITY_FIXTURES[2];
    if (fixture === undefined) throw new Error('Missing fidelity fixture.');
    const { source, spec } = fixtureSpec(fixture);
    const firstUnit = spec.structure.informationUnits[0];
    const relation = spec.structure.relations[0];
    if (firstUnit === undefined || relation === undefined) {
      throw new Error('Fixture structure is incomplete.');
    }
    const expected = expectedContract(source, spec, fixture.targetConceptId);

    expect(
      validateReferenceFidelitySpec(
        {
          ...spec,
          structure: {
            ...spec.structure,
            informationUnits: [...spec.structure.informationUnits, firstUnit],
          },
        },
        expected,
      ),
    ).toEqual({
      kind: 'rejected',
      error: { code: 'DUPLICATE_UNIT_ID', path: 'structure.informationUnits' },
    });
    expect(
      validateReferenceFidelitySpec(
        {
          ...spec,
          structure: {
            ...spec.structure,
            relations: [
              ...spec.structure.relations,
              { ...relation, toUnitId: 'unknown_unit' },
            ],
          },
        },
        expected,
      ),
    ).toEqual({
      kind: 'rejected',
      error: { code: 'INVALID_RELATION', path: 'structure.relations' },
    });
    expect(
      validateReferenceFidelitySpec(
        {
          ...spec,
          structure: {
            ...spec.structure,
            relations: [
              ...spec.structure.relations,
              {
                ...relation,
                fromUnitId: 'fact_conclusion',
                toUnitId: 'fact_condition',
              },
            ],
          },
        },
        expected,
      ),
    ).toEqual({
      kind: 'rejected',
      error: { code: 'CYCLIC_RELATION', path: 'structure.relations' },
    });
    expect(
      validateReferenceFidelitySpec(
        {
          ...spec,
          structure: {
            ...spec.structure,
            optionMappings: spec.structure.optionMappings.slice(1),
          },
        },
        expected,
      ),
    ).toEqual({
      kind: 'rejected',
      error: {
        code: 'INCOMPLETE_OPTION_MAPPING',
        path: 'structure.optionMappings',
      },
    });
  });
});
