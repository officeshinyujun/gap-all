import {
  validateConceptPayload,
  validateReferenceFrame,
  validateReferenceFrameJson,
} from './reference-frame.types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const INFORMATION_SHAPES = [
  'comparison',
  'condition_flow',
  'role_dialogue',
  'case_profile',
  'document_rules',
  'quantitative_change',
  'forum_qa',
  'instruction_scene',
  'public_notice',
] as const;

type SemanticIncidentManifest = Readonly<{
  incidents: readonly Readonly<{
    id: string;
    observedPath: string;
    payload: Record<string, unknown>;
    expected: Readonly<{ kind: 'accepted' }>;
  }>[];
}>;

const semanticIncidentManifest = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures/reference-planner-failures/manifest.json'),
    'utf8',
  ),
) as SemanticIncidentManifest;

function validReferenceFrame(): Record<string, unknown> {
  return {
    source: {
      sourceId: 'success-10-001',
      sourceHash: 'sha256:reference-frame',
    },
    subject: 'success',
    unitRange: {
      start: 10,
      end: 12,
    },
    stem: {
      style: 'Select the correct conclusion from the material.',
      polarity: 'positive',
      languageSignals: ['formal', 'evidence-based'],
    },
    response: {
      mode: 'truth_combination',
      choiceEncoding: 'truth_combination',
      choiceCount: 5,
      viewItemCount: 3,
      choiceTopology: 'combo_sets',
      combinationPlan: {
        expectedAnswerCount: 1,
        optionCount: 5,
        topology: 'combo_sets',
      },
    },
    materialDensity: {
      targetLength: 240,
      paragraphCount: 2,
      namedEntities: 2,
      numericFacts: 1,
      conditionCount: 2,
    },
    informationShape: 'comparison',
    difficultySignals: ['requires condition comparison'],
    structureBlueprint: validStructureBlueprint(),
    semanticAtoms: [
      {
        id: 'atom_eligibility_condition',
        subjectSlot: 'actor_a',
        predicateKind: 'satisfies_condition',
        operator: 'conditional',
        objectSlot: 'process_a',
        quantityRole: null,
        polarity: true,
      },
    ],
    groundingLexicon: {
      entities: [
        { slot: 'actor_a', class: 'person' },
        { slot: 'process_a', class: 'process' },
      ],
      quantities: [],
      rules: [
        {
          id: 'rule_eligibility',
          conceptId: 'concept_career_planning',
          polarity: true,
        },
      ],
      bindings: [
        {
          atomId: 'atom_eligibility_condition',
          entitySlots: ['actor_a', 'process_a'],
          quantityIds: [],
          ruleIds: ['rule_eligibility'],
        },
      ],
    },
    shell: {
      kind: 'document',
      requiresViewBlock: true,
      requiresChoiceCombination: true,
      requiresStructuredSource: true,
    },
  };
}

type StructureBlueprintFixture = Readonly<{
  informationUnits: readonly Readonly<{
    id: string;
    order: number;
    kind: string;
    atomIds: readonly string[];
  }>[];
  relations: readonly Readonly<{
    kind: string;
    fromUnitId: string;
    toUnitId: string;
  }>[];
  reasoningSteps: readonly Readonly<{
    id: string;
    order: number;
    operation: string;
    unitIds: readonly string[];
    dependsOnStepIds: readonly string[];
  }>[];
  itemRoles: readonly Readonly<{
    itemKind: string;
    itemIndex: number;
    role: string;
    unitIds: readonly string[];
    reasoningStepIds: readonly string[];
  }>[];
  evidenceBlocks: readonly Readonly<{
    itemKind: 'choice' | 'view_item';
    itemIndex: number;
    role: string;
    unitIds: readonly string[];
    reasoningStepIds: readonly string[];
  }>[];
}>;

function validStructureBlueprint(): StructureBlueprintFixture {
  return {
    informationUnits: [
      {
        id: 'unit_1',
        order: 1,
        kind: 'context',
        atomIds: ['atom_eligibility_condition'],
      },
      {
        id: 'unit_2',
        order: 2,
        kind: 'condition',
        atomIds: ['atom_eligibility_condition'],
      },
      {
        id: 'unit_3',
        order: 3,
        kind: 'exception',
        atomIds: ['atom_eligibility_condition'],
      },
      {
        id: 'unit_4',
        order: 4,
        kind: 'conclusion',
        atomIds: ['atom_eligibility_condition'],
      },
    ],
    relations: [
      {
        kind: 'condition_of',
        fromUnitId: 'unit_2',
        toUnitId: 'unit_4',
      },
      {
        kind: 'exception_to',
        fromUnitId: 'unit_3',
        toUnitId: 'unit_4',
      },
    ],
    reasoningSteps: [
      {
        id: 'step_1',
        order: 1,
        operation: 'identify_condition',
        unitIds: ['unit_2'],
        dependsOnStepIds: [],
      },
      {
        id: 'step_2',
        order: 2,
        operation: 'apply_exception',
        unitIds: ['unit_2', 'unit_3', 'unit_4'],
        dependsOnStepIds: ['step_1'],
      },
    ],
    itemRoles: [
      {
        itemKind: 'choice',
        itemIndex: 1,
        role: 'correct',
        unitIds: ['unit_4'],
        reasoningStepIds: ['step_2'],
      },
      {
        itemKind: 'choice',
        itemIndex: 2,
        role: 'condition_omission',
        unitIds: ['unit_2'],
        reasoningStepIds: ['step_1'],
      },
      {
        itemKind: 'choice',
        itemIndex: 3,
        role: 'condition_reversal',
        unitIds: ['unit_2', 'unit_4'],
        reasoningStepIds: ['step_2'],
      },
      {
        itemKind: 'choice',
        itemIndex: 4,
        role: 'exception_omission',
        unitIds: ['unit_3'],
        reasoningStepIds: ['step_2'],
      },
      {
        itemKind: 'choice',
        itemIndex: 5,
        role: 'irrelevant',
        unitIds: ['unit_1'],
        reasoningStepIds: ['step_1'],
      },
      {
        itemKind: 'view_item',
        itemIndex: 1,
        role: 'premise',
        unitIds: ['unit_1'],
        reasoningStepIds: ['step_1'],
      },
      {
        itemKind: 'view_item',
        itemIndex: 2,
        role: 'condition',
        unitIds: ['unit_2'],
        reasoningStepIds: ['step_1'],
      },
      {
        itemKind: 'view_item',
        itemIndex: 3,
        role: 'conclusion',
        unitIds: ['unit_4'],
        reasoningStepIds: ['step_2'],
      },
    ],
    evidenceBlocks: [
      {
        itemKind: 'choice',
        itemIndex: 1,
        role: 'correct',
        unitIds: ['unit_4'],
        reasoningStepIds: ['step_2'],
      },
      {
        itemKind: 'choice',
        itemIndex: 2,
        role: 'condition_omission',
        unitIds: ['unit_2'],
        reasoningStepIds: ['step_1'],
      },
      {
        itemKind: 'choice',
        itemIndex: 3,
        role: 'condition_reversal',
        unitIds: ['unit_2', 'unit_4'],
        reasoningStepIds: ['step_2'],
      },
      {
        itemKind: 'choice',
        itemIndex: 4,
        role: 'exception_omission',
        unitIds: ['unit_3'],
        reasoningStepIds: ['step_2'],
      },
      {
        itemKind: 'choice',
        itemIndex: 5,
        role: 'irrelevant',
        unitIds: ['unit_1'],
        reasoningStepIds: ['step_1'],
      },
      {
        itemKind: 'view_item',
        itemIndex: 1,
        role: 'premise',
        unitIds: ['unit_1'],
        reasoningStepIds: ['step_1'],
      },
      {
        itemKind: 'view_item',
        itemIndex: 2,
        role: 'condition',
        unitIds: ['unit_2'],
        reasoningStepIds: ['step_1'],
      },
      {
        itemKind: 'view_item',
        itemIndex: 3,
        role: 'conclusion',
        unitIds: ['unit_4'],
        reasoningStepIds: ['step_2'],
      },
    ],
  };
}

function validConceptPayload(): Record<string, unknown> {
  return {
    source: {
      sourceId: 'success-10-001',
      sourceHash: 'sha256:reference-frame',
    },
    subject: 'success',
    unitRange: {
      start: 10,
      end: 12,
    },
    eligibleUnits: [10, 11, 12],
    targetConceptIds: ['concept_capacity_planning'],
    supportingConceptIds: ['concept_production_schedule'],
    distractorAxes: ['condition omission'],
    answerPlan: {
      responseMode: 'truth_combination',
      choiceEncoding: 'truth_combination',
      expectedAnswerCount: 1,
      options: [
        {
          id: 'option_1',
          verdict: true,
          atomIds: ['atom_eligibility_condition'],
        },
      ],
    },
    requiredInformationShape: 'comparison',
    noveltyRules: ['Do not reuse the source facts.'],
  };
}

describe('Reference Frame JSON contract', () => {
  it('requires enum-only semantic atoms and typed grounding bindings', () => {
    const result = validateReferenceFrame(validReferenceFrame());

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          semanticAtoms: [
            expect.objectContaining({
              id: 'atom_eligibility_condition',
              subjectSlot: 'actor_a',
              predicateKind: 'satisfies_condition',
              operator: 'conditional',
              objectSlot: 'process_a',
              quantityRole: null,
              polarity: true,
            }),
          ],
          groundingLexicon: expect.objectContaining({
            bindings: [
              expect.objectContaining({
                atomId: 'atom_eligibility_condition',
                ruleIds: ['rule_eligibility'],
              }),
            ],
          }),
        }),
      }),
    );
  });

  it.each(
    semanticIncidentManifest.incidents.filter(({ observedPath }) =>
      observedPath.startsWith('referenceFrame.semanticAtoms['),
    ),
  )('accepts sanitized live semantic incident $id', (incident) => {
    const frame = validReferenceFrame();
    const atom: Record<string, unknown> = {
      ...incident.payload,
      id: 'atom_eligibility_condition',
    };
    const objectSlot = atom.objectSlot;
    const quantityRole = atom.quantityRole;
    const groundingLexicon = frame.groundingLexicon as Record<string, unknown>;
    frame.semanticAtoms = [atom];
    frame.groundingLexicon = {
      ...groundingLexicon,
      entities: [
        { slot: 'actor_a', class: 'person' },
        ...(typeof objectSlot === 'string'
          ? [{ slot: objectSlot, class: 'artifact' }]
          : []),
      ],
      quantities:
        typeof quantityRole === 'string'
          ? [{ id: 'quantity_1', role: quantityRole, value: 1, unit: 'count' }]
          : [],
      bindings: [
        {
          atomId: atom.id,
          entitySlots: ['actor_a'],
          quantityIds: typeof quantityRole === 'string' ? ['quantity_1'] : [],
          ruleIds: ['rule_eligibility'],
        },
      ],
    };

    expect(validateReferenceFrame(frame)).toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(incident.expected.kind).toBe('accepted');
  });

  it('accepts the sanitized live condition relation when its unit references are forward and declared', () => {
    const frame = validReferenceFrame();
    const blueprint = frame.structureBlueprint as Record<string, unknown>;
    blueprint.relations = [
      {
        kind: 'condition_of',
        fromUnitId: 'unit_2',
        toUnitId: 'unit_4',
      },
    ];

    expect(validateReferenceFrame(frame)).toEqual(
      expect.objectContaining({ ok: true }),
    );
  });

  it('accepts an anonymized ordered structure blueprint', () => {
    const frame = validReferenceFrame();
    frame.structureBlueprint = validStructureBlueprint();

    const result = validateReferenceFrame(frame);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.structureBlueprint?.informationUnits).toEqual([
      {
        id: 'unit_1',
        order: 1,
        kind: 'context',
        atomIds: ['atom_eligibility_condition'],
      },
      {
        id: 'unit_2',
        order: 2,
        kind: 'condition',
        atomIds: ['atom_eligibility_condition'],
      },
      {
        id: 'unit_3',
        order: 3,
        kind: 'exception',
        atomIds: ['atom_eligibility_condition'],
      },
      {
        id: 'unit_4',
        order: 4,
        kind: 'conclusion',
        atomIds: ['atom_eligibility_condition'],
      },
    ]);
    expect(result.value.structureBlueprint?.evidenceBlocks).toEqual(
      validStructureBlueprint().evidenceBlocks,
    );
  });

  it('rejects a structure blueprint with a missing information-unit order', () => {
    const blueprint = validStructureBlueprint();
    const frame = {
      ...validReferenceFrame(),
      structureBlueprint: {
        ...blueprint,
        evidenceBlocks: blueprint.evidenceBlocks,
        informationUnits: blueprint.informationUnits.map((unit) =>
          unit.id === 'unit_3' ? { ...unit, order: 4 } : unit,
        ),
      },
    };

    expect(validateReferenceFrame(frame)).toEqual({
      ok: false,
      error: {
        code: 'MISSING_BLUEPRINT_ORDER',
        path: 'referenceFrame.structureBlueprint.informationUnits[2].order',
      },
    });
  });

  it('rejects raw source wording used as a blueprint identifier', () => {
    const blueprint = validStructureBlueprint();
    const frame = {
      ...validReferenceFrame(),
      structureBlueprint: {
        ...blueprint,
        evidenceBlocks: blueprint.evidenceBlocks,
        informationUnits: blueprint.informationUnits.map((unit) =>
          unit.id === 'unit_1'
            ? { ...unit, id: 'A learner must compare two careers.' }
            : unit,
        ),
      },
    };

    expect(validateReferenceFrame(frame)).toEqual({
      ok: false,
      error: {
        code: 'INVALID_BLUEPRINT_IDENTIFIER',
        path: 'referenceFrame.structureBlueprint.informationUnits[0].id',
      },
    });
  });

  it('rejects reversed and cyclic condition relations', () => {
    const blueprint = validStructureBlueprint();
    const reversedFrame = {
      ...validReferenceFrame(),
      structureBlueprint: {
        ...blueprint,
        evidenceBlocks: blueprint.evidenceBlocks,
        relations: blueprint.relations.map((relation) =>
          relation.kind === 'condition_of'
            ? { ...relation, toUnitId: 'unit_1' }
            : relation,
        ),
      },
    };
    const cyclicFrame = {
      ...validReferenceFrame(),
      structureBlueprint: {
        ...blueprint,
        evidenceBlocks: blueprint.evidenceBlocks,
        relations: blueprint.relations.map((relation) =>
          relation.kind === 'condition_of'
            ? { ...relation, toUnitId: 'unit_4' }
            : {
                kind: 'exception_to',
                fromUnitId: 'unit_4',
                toUnitId: 'unit_2',
              },
        ),
      },
    };

    expect(validateReferenceFrame(reversedFrame)).toEqual({
      ok: false,
      error: {
        code: 'INVALID_BLUEPRINT_RELATION',
        path: 'referenceFrame.structureBlueprint.relations[0]',
      },
    });
    expect(validateReferenceFrame(cyclicFrame)).toEqual({
      ok: false,
      error: {
        code: 'CYCLIC_BLUEPRINT_RELATION',
        path: 'referenceFrame.structureBlueprint.relations',
      },
    });
  });

  it('rejects duplicate identifiers and choice roles without valid references', () => {
    const blueprint = validStructureBlueprint();
    const duplicateIdentifierFrame = {
      ...validReferenceFrame(),
      structureBlueprint: {
        ...blueprint,
        evidenceBlocks: blueprint.evidenceBlocks,
        informationUnits: blueprint.informationUnits.map((unit) =>
          unit.id === 'unit_4' ? { ...unit, id: 'unit_3' } : unit,
        ),
      },
    };
    const unreferencedRoleFrame = {
      ...validReferenceFrame(),
      structureBlueprint: {
        ...blueprint,
        evidenceBlocks: blueprint.evidenceBlocks,
        itemRoles: blueprint.itemRoles.map((role) =>
          role.itemKind === 'choice' && role.itemIndex === 1
            ? { ...role, unitIds: ['unit_99'] }
            : role,
        ),
      },
    };

    expect(validateReferenceFrame(duplicateIdentifierFrame)).toEqual({
      ok: false,
      error: {
        code: 'DUPLICATE_BLUEPRINT_IDENTIFIER',
        path: 'referenceFrame.structureBlueprint.informationUnits[3].id',
      },
    });
    expect(validateReferenceFrame(unreferencedRoleFrame)).toEqual({
      ok: false,
      error: {
        code: 'UNREFERENCED_BLUEPRINT_ROLE',
        path: 'referenceFrame.structureBlueprint.itemRoles[0].unitIds',
      },
    });
  });

  it('rejects malformed and reordered evidence blocks', () => {
    const blueprint = validStructureBlueprint();
    const malformedEvidenceFrame = {
      ...validReferenceFrame(),
      structureBlueprint: {
        ...blueprint,
        evidenceBlocks: blueprint.evidenceBlocks.map((block) =>
          block.itemKind === 'choice' && block.itemIndex === 1
            ? { ...block, unitIds: ['unit_99'] }
            : block,
        ),
      },
    };
    const reorderedEvidenceFrame = {
      ...validReferenceFrame(),
      structureBlueprint: {
        ...blueprint,
        evidenceBlocks: [...blueprint.evidenceBlocks].reverse(),
      },
    };

    expect(validateReferenceFrame(malformedEvidenceFrame)).toEqual({
      ok: false,
      error: {
        code: 'UNREFERENCED_BLUEPRINT_ROLE',
        path: 'referenceFrame.structureBlueprint.evidenceBlocks[0].unitIds',
      },
    });
    expect(validateReferenceFrame(reorderedEvidenceFrame)).toEqual({
      ok: false,
      error: {
        code: 'INVALID_STRUCTURE_BLUEPRINT',
        path: 'referenceFrame.structureBlueprint.evidenceBlocks[0].order',
      },
    });
  });

  it('rejects a plain shell that claims a structured source', () => {
    const frame: ReturnType<typeof validReferenceFrame> = {
      ...validReferenceFrame(),
      shell: {
        kind: 'plain',
        requiresViewBlock: false,
        requiresChoiceCombination: false,
        requiresStructuredSource: true,
      },
    };

    expect(validateReferenceFrame(frame)).toEqual({
      ok: false,
      error: {
        code: 'INVALID_STRUCTURE_BLUEPRINT',
        path: 'referenceFrame.shell',
      },
    });
  });

  it('rejects a structured shell that disables structured-source mechanics', () => {
    const frame: ReturnType<typeof validReferenceFrame> = {
      ...validReferenceFrame(),
      shell: {
        kind: 'law_excerpt',
        requiresViewBlock: true,
        requiresChoiceCombination: true,
        requiresStructuredSource: true,
      },
    };

    expect(validateReferenceFrame(frame)).toEqual(
      expect.objectContaining({ ok: true }),
    );

    const toggledFrame: ReturnType<typeof validReferenceFrame> = {
      ...frame,
      shell: {
        kind: 'law_excerpt',
        requiresViewBlock: true,
        requiresChoiceCombination: true,
        requiresStructuredSource: false,
      },
    };

    expect(validateReferenceFrame(toggledFrame)).toEqual({
      ok: false,
      error: {
        code: 'INVALID_FIELD_VALUE',
        path: 'referenceFrame.shell.requiresStructuredSource',
      },
    });
  });

  it('accepts a valid JSON frame and preserves the source identity', () => {
    const result = validateReferenceFrameJson(
      JSON.stringify(validReferenceFrame()),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.source).toEqual({
      sourceId: 'success-10-001',
      sourceHash: 'sha256:reference-frame',
    });
    expect(result.value.response.mode).toBe('truth_combination');
  });

  it('rejects a null external value with a stable invalid-object reason code', () => {
    const result = validateReferenceFrame(null);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('INVALID_OBJECT');
  });

  it('rejects a partial frame without its unit range', () => {
    const frame = validReferenceFrame();
    delete frame.unitRange;

    const result = validateReferenceFrame(frame);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('MISSING_UNIT_RANGE');
  });

  it('rejects an unsupported response mode', () => {
    const frame = validReferenceFrame();
    frame.response = {
      mode: 'free_response',
      choiceEncoding: 'truth_combination',
      choiceCount: 5,
      viewItemCount: 3,
    };

    const result = validateReferenceFrame(frame);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('UNSUPPORTED_RESPONSE_MODE');
  });

  it('rejects an invalid choice encoding', () => {
    const frame = validReferenceFrame();
    frame.response = {
      mode: 'truth_combination',
      choiceEncoding: 'free_text',
      choiceCount: 5,
      viewItemCount: 3,
    };

    const result = validateReferenceFrame(frame);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('INVALID_CHOICE_ENCODING');
  });

  it('rejects fields outside the explicit frame JSON contract', () => {
    const frame = validReferenceFrame();
    frame.untrackedField = 'not accepted';

    const result = validateReferenceFrame(frame);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('UNKNOWN_FIELD');
  });
});

describe('Concept Payload JSON contract', () => {
  it.each(INFORMATION_SHAPES)(
    'accepts %s as a payload-selected information shape',
    (informationShape) => {
      const payload = validConceptPayload();
      payload.requiredInformationShape = informationShape;

      const result = validateConceptPayload(payload);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value.requiredInformationShape).toBe(informationShape);
    },
  );

  it('rejects an empty distractor axis set', () => {
    const payload = validConceptPayload();
    payload.distractorAxes = [];

    const result = validateConceptPayload(payload);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('EMPTY_DISTRACTOR_AXES');
  });

  it('rejects a payload whose selected unit falls outside its range', () => {
    const payload = validConceptPayload();
    payload.eligibleUnits = [9, 10, 11, 12];

    const result = validateConceptPayload(payload);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('INVALID_UNIT_RANGE');
  });

  it('rejects an unsupported payload answer encoding', () => {
    const payload = validConceptPayload();
    payload.answerPlan = {
      responseMode: 'truth_combination',
      choiceEncoding: 'free_text',
      expectedAnswerCount: 1,
      options: [
        {
          id: 'option_1',
          verdict: true,
          atomIds: ['atom_eligibility_condition'],
        },
      ],
    };

    const result = validateConceptPayload(payload);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe('INVALID_CHOICE_ENCODING');
  });

  it('accepts a truth-combination answer plan with ordered evidence-backed claims', () => {
    const payload = validConceptPayload();
    payload.answerPlan = {
      responseMode: 'truth_combination',
      choiceEncoding: 'truth_combination',
      expectedAnswerCount: 3,
      options: [
        {
          id: 'option_1',
          verdict: true,
          atomIds: ['atom_eligibility_condition'],
        },
        {
          id: 'option_2',
          verdict: false,
          atomIds: ['atom_eligibility_condition'],
        },
        {
          id: 'option_3',
          verdict: true,
          atomIds: ['atom_eligibility_condition'],
        },
      ],
    };

    const result = validateConceptPayload(payload);

    expect(result.ok).toBe(true);
  });

  it('rejects a single-selection answer plan with duplicate fixed option IDs', () => {
    const payload = validConceptPayload();
    payload.answerPlan = {
      responseMode: 'single_selection',
      choiceEncoding: 'single_choice',
      expectedAnswerCount: 5,
      options: [
        {
          id: 'option_1',
          verdict: true,
          atomIds: ['atom_eligibility_condition'],
        },
        {
          id: 'option_1',
          verdict: false,
          atomIds: ['atom_eligibility_condition'],
        },
        {
          id: 'option_3',
          verdict: false,
          atomIds: ['atom_eligibility_condition'],
        },
        {
          id: 'option_4',
          verdict: false,
          atomIds: ['atom_eligibility_condition'],
        },
        {
          id: 'option_5',
          verdict: false,
          atomIds: ['atom_eligibility_condition'],
        },
      ],
    };

    const result = validateConceptPayload(payload);

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'INVALID_FIELD_VALUE',
        path: 'conceptPayload.answerPlan.options',
      },
    });
  });

  it('rejects a frame whose choice-role coverage omits a required mapping', () => {
    const blueprint = validStructureBlueprint();
    const result = validateReferenceFrame({
      ...validReferenceFrame(),
      structureBlueprint: {
        ...blueprint,
        itemRoles: blueprint.itemRoles.slice(1),
        evidenceBlocks: blueprint.evidenceBlocks.slice(1),
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'UNREFERENCED_BLUEPRINT_ROLE',
        path: 'referenceFrame.structureBlueprint.itemRoles',
      },
    });
  });
});
