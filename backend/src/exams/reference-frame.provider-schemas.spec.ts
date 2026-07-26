import {
  conceptPayloadStructuredOutput,
  referenceFrameStructuredOutput,
} from './reference-frame.provider-schemas';
import {
  validFrameJson,
  validPayloadJson,
} from './reference-frame-planner.fixtures';
import {
  validateConceptPayloadJson,
  validateReferenceFrameJson,
} from './reference-frame.types';

function expectExactObjectContract(
  schema: Readonly<{
    properties: Readonly<Record<string, unknown>>;
    required: readonly string[];
    additionalProperties: false;
  }>,
): void {
  expect(schema.additionalProperties).toBe(false);
  expect(Object.keys(schema.properties)).toEqual(schema.required);
}

describe('Reference frame structured-output schemas', () => {
  it('requires the complete strict Frame object contract', () => {
    const givenDescriptor = referenceFrameStructuredOutput;
    const whenSchema = givenDescriptor.schema;

    expect(givenDescriptor.name).toBe('reference_frame');
    expect(givenDescriptor.strict).toBe(true);
    expect(whenSchema.type).toBe('object');
    expect(whenSchema.required).toEqual([
      'source',
      'subject',
      'unitRange',
      'stem',
      'response',
      'shell',
      'materialDensity',
      'informationShape',
      'difficultySignals',
      'structureBlueprint',
      'semanticAtoms',
      'groundingLexicon',
    ]);
    expectExactObjectContract(whenSchema);

    expect(whenSchema.properties.source).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['sourceId', 'sourceHash'],
    });
    expect(whenSchema.properties.unitRange).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['start', 'end'],
    });
    expect(whenSchema.properties.stem).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['style', 'polarity', 'languageSignals'],
    });
    expect(whenSchema.properties.response).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'mode',
        'choiceEncoding',
        'choiceCount',
        'viewItemCount',
        'choiceTopology',
        'combinationPlan',
      ],
    });
    expect(whenSchema.properties.materialDensity).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'targetLength',
        'paragraphCount',
        'namedEntities',
        'numericFacts',
        'conditionCount',
      ],
    });
    expect(whenSchema.properties.shell).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'kind',
        'requiresViewBlock',
        'requiresChoiceCombination',
        'requiresStructuredSource',
      ],
    });
    expectExactObjectContract(whenSchema.properties.source);
    expectExactObjectContract(whenSchema.properties.unitRange);
    expectExactObjectContract(whenSchema.properties.stem);
    expectExactObjectContract(whenSchema.properties.response);
    expectExactObjectContract(whenSchema.properties.materialDensity);
    expectExactObjectContract(whenSchema.properties.shell);
    expect(whenSchema.properties.subject).toEqual({
      type: 'string',
      enum: ['success', 'kongil'],
    });
    expect(whenSchema.properties.stem.properties.polarity).toEqual({
      type: 'string',
      enum: ['positive', 'negative'],
    });
    expect(whenSchema.properties.stem.properties.languageSignals).toEqual({
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 1,
    });
    expect(whenSchema.properties.response.properties.mode).toEqual({
      type: 'string',
      enum: [
        'truth_combination',
        'single_selection',
        'label_matching',
        'pair_selection',
        'blank_workflow',
      ],
    });
    expect(whenSchema.properties.response.properties.choiceCount).toEqual({
      type: 'integer',
      minimum: 5,
      maximum: 5,
    });
    expect(whenSchema.properties.response.properties.viewItemCount).toEqual({
      type: 'integer',
      minimum: 0,
    });
    expect(whenSchema.properties['structureBlueprint']).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'informationUnits',
        'relations',
        'reasoningSteps',
        'itemRoles',
        'evidenceBlocks',
      ],
    });
    expect(whenSchema.properties['structureBlueprint']).toMatchObject({
      properties: {
        informationUnits: {
          items: {
            properties: {
              id: { pattern: '^unit_[1-9][0-9]*$' },
            },
          },
        },
        reasoningSteps: {
          items: {
            properties: {
              id: { pattern: '^step_[1-9][0-9]*$' },
            },
          },
        },
      },
    });
  });

  it('requires the complete strict Payload object contract', () => {
    const givenDescriptor = conceptPayloadStructuredOutput;
    const whenSchema = givenDescriptor.schema;

    expect(givenDescriptor.name).toBe('concept_payload');
    expect(givenDescriptor.strict).toBe(true);
    expect(whenSchema.type).toBe('object');
    expect(whenSchema.required).toEqual([
      'source',
      'subject',
      'unitRange',
      'eligibleUnits',
      'targetConceptIds',
      'supportingConceptIds',
      'distractorAxes',
      'answerPlan',
      'requiredInformationShape',
      'noveltyRules',
    ]);
    expectExactObjectContract(whenSchema);

    expect(whenSchema.properties.source).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['sourceId', 'sourceHash'],
    });
    expect(whenSchema.properties.unitRange).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['start', 'end'],
    });
    expect(whenSchema.properties.answerPlan).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'responseMode',
        'choiceEncoding',
        'expectedAnswerCount',
        'options',
      ],
    });
    expectExactObjectContract(whenSchema.properties.source);
    expectExactObjectContract(whenSchema.properties.unitRange);
    expectExactObjectContract(whenSchema.properties.answerPlan);
    expect(whenSchema.properties.eligibleUnits).toEqual({
      type: 'array',
      minItems: 1,
      items: { type: 'integer', minimum: 1 },
    });
    expect(whenSchema.properties.supportingConceptIds).toEqual({
      type: 'array',
      items: { type: 'string', pattern: '^concept_[a-z0-9_]+$' },
    });
    expect(
      whenSchema.properties.answerPlan.properties.options.items.properties
        .atomIds,
    ).toEqual({
      type: 'array',
      items: { type: 'string', pattern: '^atom_[a-z0-9_]+$' },
      minItems: 1,
    });
  });

  it('covers every object field emitted by valid existing Frame and Payload fixtures', () => {
    const givenFrame = validateReferenceFrameJson(validFrameJson());
    const givenPayload = validateConceptPayloadJson(validPayloadJson());

    expect(givenFrame.ok).toBe(true);
    expect(givenPayload.ok).toBe(true);
    if (!givenFrame.ok || !givenPayload.ok) {
      return;
    }

    const whenFrameSchema = referenceFrameStructuredOutput.schema;
    const whenPayloadSchema = conceptPayloadStructuredOutput.schema;

    expect(whenFrameSchema.required).toEqual(
      Object.keys(givenFrame.value).filter((key) => key !== 'archetype'),
    );
    expect(whenFrameSchema.properties.source.required).toEqual(
      Object.keys(givenFrame.value.source),
    );
    expect(whenFrameSchema.properties.unitRange.required).toEqual(
      Object.keys(givenFrame.value.unitRange),
    );
    expect(whenFrameSchema.properties.stem.required).toEqual(
      Object.keys(givenFrame.value.stem),
    );
    expect(whenFrameSchema.properties.response.required).toEqual(
      Object.keys(givenFrame.value.response),
    );
    expect(whenFrameSchema.properties.materialDensity.required).toEqual(
      Object.keys(givenFrame.value.materialDensity),
    );
    expect(whenPayloadSchema.required).toEqual(Object.keys(givenPayload.value));
    expect(whenPayloadSchema.properties.source.required).toEqual(
      Object.keys(givenPayload.value.source),
    );
    expect(whenPayloadSchema.properties.unitRange.required).toEqual(
      Object.keys(givenPayload.value.unitRange),
    );
    expect(whenPayloadSchema.properties.answerPlan.required).toEqual(
      Object.keys(givenPayload.value.answerPlan),
    );
  });

  it('freezes descriptors through nested schemas and enum arrays', () => {
    const givenFrameDescriptor = referenceFrameStructuredOutput;
    const givenPayloadDescriptor = conceptPayloadStructuredOutput;

    expect(Object.isFrozen(givenFrameDescriptor)).toBe(true);
    expect(Object.isFrozen(givenFrameDescriptor.schema)).toBe(true);
    expect(Object.isFrozen(givenFrameDescriptor.schema.properties)).toBe(true);
    expect(
      Object.isFrozen(givenFrameDescriptor.schema.properties.response),
    ).toBe(true);
    expect(
      Object.isFrozen(
        givenFrameDescriptor.schema.properties.response.properties.mode.enum,
      ),
    ).toBe(true);
    expect(
      Object.isFrozen(givenPayloadDescriptor.schema.properties.answerPlan),
    ).toBe(true);
    expect(
      Object.isFrozen(
        givenPayloadDescriptor.schema.properties.answerPlan.properties.options
          .items.properties,
      ),
    ).toBe(true);
  });
});
