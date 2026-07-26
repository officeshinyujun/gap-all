import { referenceFinalOutputSchema } from './reference-final-output-schema';
import { STRUCTURED_TPL_NAMES } from './tpl-schemas';

const fidelityTraceRequirements = {
  evidenceBlockCount: 2,
  targetConceptCount: 1,
  supportingConceptCount: 0,
  distractorTransformationCount: 1,
  informationUnitCount: 2,
  reasoningStepCount: 1,
  answerOptionCount: 2,
  viewItemCount: 2,
};

function schemaRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectStrictObjectTree(schema: Record<string, unknown>): void {
  if (schema.type === 'object') {
    const properties = schema.properties as Record<string, unknown>;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(Object.keys(properties));
    for (const property of Object.values(properties)) {
      if (schemaRecord(property)) expectStrictObjectTree(property);
    }
  }
  if (schema.type === 'array' && schemaRecord(schema.items)) {
    expectStrictObjectTree(schema.items);
  }
}

describe('referenceFinalOutputSchema', () => {
  it('requires null comboBlock when the source has no view items', () => {
    const schema = referenceFinalOutputSchema({
      selectedTemplate: 'TPL_COMPARATIVE_MATRIX',
      sourceHash: 'source-hash-1',
      choiceCount: 5,
      viewItemCount: 0,
      fidelityTraceRequirements: {
        ...fidelityTraceRequirements,
        viewItemCount: 0,
      },
    });

    const question = (schema.properties as Record<string, unknown>)
      .questions as Record<string, unknown>;
    const item = question.items as Record<string, unknown>;
    const properties = item.properties as Record<string, unknown>;

    expect(properties.comboBlock).toEqual({ type: 'null' });
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toContain('templateType');
  });

  it('sets exact source-derived array cardinalities and selected template', () => {
    const schema = referenceFinalOutputSchema({
      selectedTemplate: 'TPL_COMPARATIVE_MATRIX',
      sourceHash: 'source-hash-1',
      choiceCount: 5,
      viewItemCount: 3,
      fidelityTraceRequirements: {
        ...fidelityTraceRequirements,
        viewItemCount: 3,
      },
    });

    const questions = (schema.properties as Record<string, unknown>)
      .questions as Record<string, unknown>;
    const item = questions.items as Record<string, unknown>;
    const properties = item.properties as Record<string, unknown>;
    const comboBlock = properties.comboBlock as Record<string, unknown>;
    const comboProperties = comboBlock.properties as Record<string, unknown>;
    const comboItems = comboProperties.items as Record<string, unknown>;
    const choices = properties.choices as Record<string, unknown>;
    const templateType = properties.templateType as Record<string, unknown>;

    expect(questions).toMatchObject({ minItems: 1, maxItems: 1 });
    expect(comboItems).toMatchObject({ minItems: 3, maxItems: 3 });
    expect(choices).toMatchObject({ minItems: 5, maxItems: 5 });
    expect(templateType).toEqual({
      type: 'string',
      enum: ['TPL_COMPARATIVE_MATRIX'],
    });
  });

  it('requires a structural-only archetype fidelity trace', () => {
    const schema = referenceFinalOutputSchema({
      selectedTemplate: 'TPL_COMPARATIVE_MATRIX',
      sourceHash: 'source-hash-1',
      choiceCount: 5,
      viewItemCount: 2,
      fidelityTraceRequirements,
    });

    const questions = (schema.properties as Record<string, unknown>)
      .questions as Record<string, unknown>;
    const item = questions.items as Record<string, unknown>;
    const properties = item.properties as Record<string, unknown>;
    const fidelityTrace = properties.fidelityTrace as Record<string, unknown>;
    const traceProperties = fidelityTrace.properties as Record<string, unknown>;

    expect(fidelityTrace).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'shell',
        'evidenceBlocks',
        'conceptRoles',
        'distractorTransformations',
        'informationOrder',
        'reasoningPattern',
        'reasoningSteps',
        'combinationPlan',
        'setLinkage',
        'viewItems',
        'optionSubsets',
      ],
    });
    expect(traceProperties).toEqual(
      expect.objectContaining({
        shell: expect.objectContaining({ type: 'object' }),
        evidenceBlocks: expect.objectContaining({ type: 'array' }),
        conceptRoles: expect.objectContaining({ type: 'object' }),
        distractorTransformations: expect.objectContaining({ type: 'array' }),
        informationOrder: expect.objectContaining({ type: 'array' }),
        reasoningPattern: expect.objectContaining({ type: 'string' }),
        reasoningSteps: expect.objectContaining({ type: 'array' }),
        combinationPlan: expect.objectContaining({ type: 'object' }),
        setLinkage: expect.objectContaining({ type: 'object' }),
        viewItems: expect.objectContaining({ type: 'array' }),
        optionSubsets: expect.objectContaining({ type: 'array' }),
      }),
    );
    expect(traceProperties).not.toHaveProperty('preserved');
    expect(traceProperties).not.toHaveProperty('rewritten');
  });

  it.each(STRUCTURED_TPL_NAMES)(
    'strictifies the local %s stimulus schema without widening it',
    (selectedTemplate) => {
      const schema = referenceFinalOutputSchema({
        selectedTemplate,
        sourceHash: 'source-hash-1',
        choiceCount: 5,
        viewItemCount: 4,
        fidelityTraceRequirements: {
          ...fidelityTraceRequirements,
          viewItemCount: 4,
        },
      });
      const questions = (schema.properties as Record<string, unknown>)
        .questions as Record<string, unknown>;
      const item = questions.items as Record<string, unknown>;
      const properties = item.properties as Record<string, unknown>;

      expectStrictObjectTree(
        properties.stimulusData as Record<string, unknown>,
      );
    },
  );

  it('requires controlled visual fields for generated conversations', () => {
    const schema = referenceFinalOutputSchema({
      selectedTemplate: 'TPL_CONVERSATIONAL_FLOW',
      sourceHash: 'source-hash-1',
      choiceCount: 5,
      viewItemCount: 0,
      fidelityTraceRequirements: {
        ...fidelityTraceRequirements,
        viewItemCount: 0,
      },
    });
    const questions = (schema.properties as Record<string, unknown>)
      .questions as Record<string, unknown>;
    const item = questions.items as Record<string, unknown>;
    const stimulus = (item.properties as Record<string, unknown>)
      .stimulusData as Record<string, unknown>;
    const properties = stimulus.properties as Record<string, unknown>;

    expect(stimulus.required).toEqual(
      expect.arrayContaining([
        'participants',
        'messages',
        'scene_kind',
        'visual_aid',
      ]),
    );
    expect(properties.visual_aid).toMatchObject({
      type: 'object',
      additionalProperties: false,
    });
  });
});
