import { getTplSchema, type StructuredTplName } from './tpl-schemas';

export type ReferenceFinalOutputSchemaRequest = Readonly<{
  selectedTemplate: StructuredTplName;
  sourceHash: string;
  choiceCount: number;
  viewItemCount: number;
  matrixGroundingTerms?: readonly string[];
  fidelityTraceRequirements: Readonly<{
    evidenceBlockCount: number;
    targetConceptCount: number;
    supportingConceptCount: number;
    distractorTransformationCount: number;
    informationUnitCount: number;
    reasoningStepCount: number;
    answerOptionCount: number;
    viewItemCount: number;
  }>;
}>;

type JsonSchema = Record<string, unknown>;

function isSchemaRecord(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strictSchema(schema: JsonSchema): JsonSchema {
  const properties = schema.properties;
  if (isSchemaRecord(properties)) {
    const strictProperties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        isSchemaRecord(value) ? strictSchema(value) : value,
      ]),
    );
    return {
      ...schema,
      properties: strictProperties,
      required: Object.keys(strictProperties),
      additionalProperties: false,
    };
  }

  const items = schema.items;
  if (isSchemaRecord(items)) {
    return { ...schema, items: strictSchema(items) };
  }

  return { ...schema };
}

function stimulusSchema(template: StructuredTplName): JsonSchema {
  const templateSchema = getTplSchema(template)?.schema;
  if (!isSchemaRecord(templateSchema)) {
    throw new Error(`Missing TPL schema for ${template}.`);
  }
  const properties = templateSchema.properties;
  const renderReady =
    isSchemaRecord(properties) && isSchemaRecord(properties.render_ready)
      ? properties.render_ready
      : null;
  const renderReadyProperties = renderReady?.properties;
  const stimulus =
    isSchemaRecord(renderReadyProperties) &&
    isSchemaRecord(renderReadyProperties.stimulus_data)
      ? renderReadyProperties.stimulus_data
      : null;
  if (stimulus === null) {
    throw new Error(`Missing stimulus schema for ${template}.`);
  }
  return strictSchema(stimulus);
}

function comboBlockSchema(viewItemCount: number): JsonSchema {
  if (viewItemCount === 0) return { type: 'null' };

  return {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1 },
      items: {
        type: 'array',
        minItems: viewItemCount,
        maxItems: viewItemCount,
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', minLength: 1 },
            text: { type: 'string', minLength: 1 },
          },
          required: ['key', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'items'],
    additionalProperties: false,
  };
}

function strictObject(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function fixedArray(length: number, items: JsonSchema): JsonSchema {
  return { type: 'array', minItems: length, maxItems: length, items };
}

function stringList(): JsonSchema {
  return { type: 'array', items: { type: 'string', minLength: 1 } };
}

function fidelityTraceSchema(
  requirements: ReferenceFinalOutputSchemaRequest['fidelityTraceRequirements'],
): JsonSchema {
  const outputSurface = {
    type: 'string',
    enum: ['questionStem', 'stimulusData', 'comboBlock', 'choices'],
  };
  return strictObject({
    shell: strictObject({
      materialKind: { type: 'string', minLength: 1 },
      kind: { type: 'string', minLength: 1 },
      requiresViewBlock: { type: 'boolean' },
      requiresChoiceCombination: { type: 'boolean' },
      requiresStructuredSource: { type: 'boolean' },
    }),
    evidenceBlocks: fixedArray(
      requirements.evidenceBlockCount,
      strictObject({
        order: { type: 'integer', minimum: 1 },
        itemKind: { type: 'string', enum: ['choice', 'view_item'] },
        itemIndex: { type: 'integer', minimum: 1 },
        role: { type: 'string', minLength: 1 },
        unitIds: stringList(),
        reasoningStepIds: stringList(),
        outputSurface,
      }),
    ),
    conceptRoles: strictObject({
      targetConceptIds: fixedArray(requirements.targetConceptCount, {
        type: 'string',
        minLength: 1,
      }),
      supportingConceptIds: fixedArray(requirements.supportingConceptCount, {
        type: 'string',
        minLength: 1,
      }),
    }),
    distractorTransformations: fixedArray(
      requirements.distractorTransformationCount,
      strictObject({ axis: { type: 'string', minLength: 1 }, outputSurface }),
    ),
    informationOrder: fixedArray(
      requirements.informationUnitCount,
      strictObject({
        unitId: { type: 'string', minLength: 1 },
        order: { type: 'integer', minimum: 1 },
        kind: { type: 'string', minLength: 1 },
        atomIds: stringList(),
        outputSurface,
      }),
    ),
    reasoningPattern: { type: 'string', minLength: 1 },
    reasoningSteps: fixedArray(
      requirements.reasoningStepCount,
      strictObject({
        stepId: { type: 'string', minLength: 1 },
        order: { type: 'integer', minimum: 1 },
        operation: { type: 'string', minLength: 1 },
        unitIds: stringList(),
        dependsOnStepIds: stringList(),
        outputSurface,
      }),
    ),
    combinationPlan: strictObject({
      expectedAnswerCount: { type: 'integer', minimum: 1 },
      optionCount: { type: 'integer', minimum: 1 },
      topology: { type: 'string', minLength: 1 },
      outputSurface,
    }),
    setLinkage: strictObject({
      required: { type: 'boolean' },
      position: { type: 'string', minLength: 1 },
      viewItemCount: { type: 'integer', minimum: 0 },
      outputSurface,
    }),
    viewItems: fixedArray(
      requirements.viewItemCount,
      strictObject({
        order: { type: 'integer', minimum: 1 },
        key: { type: 'string', minLength: 1 },
        outputSurface,
      }),
    ),
    optionSubsets: fixedArray(
      requirements.answerOptionCount,
      strictObject({
        optionId: { type: 'string', minLength: 1 },
        verdict: { type: 'boolean' },
        atomIds: stringList(),
        outputSurface,
      }),
    ),
  });
}

export function referenceFinalOutputSchema(
  request: ReferenceFinalOutputSchemaRequest,
): JsonSchema {
  return {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: 1,
        items: {
          type: 'object',
          properties: {
            templateType: { type: 'string', enum: [request.selectedTemplate] },
            questionStem: { type: 'string', minLength: 1 },
            stimulusData: stimulusSchema(request.selectedTemplate),
            comboBlock: comboBlockSchema(request.viewItemCount),
            choices: {
              type: 'array',
              minItems: request.choiceCount,
              maxItems: request.choiceCount,
              items: { type: 'string', minLength: 1 },
            },
            correctAnswer: {
              type: 'integer',
              minimum: 1,
              maximum: request.choiceCount,
            },
            explanation: {
              type: 'object',
              properties: { judgment: { type: 'string', minLength: 1 } },
              required: ['judgment'],
              additionalProperties: false,
            },
            fidelityTrace: fidelityTraceSchema(
              request.fidelityTraceRequirements,
            ),
            sourceEvidence: strictObject({
              sourceHash: { type: 'string', enum: [request.sourceHash] },
              targetConceptIds: fixedArray(
                request.fidelityTraceRequirements.targetConceptCount,
                { type: 'string', minLength: 1 },
              ),
              matrixGroundingTerms: groundingTermsSchema(
                request.matrixGroundingTerms ?? [],
              ),
            }),
          },
          required: [
            'templateType',
            'questionStem',
            'stimulusData',
            'comboBlock',
            'choices',
            'correctAnswer',
            'explanation',
            'fidelityTrace',
            'sourceEvidence',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['questions'],
    additionalProperties: false,
  };
}

function groundingTermsSchema(terms: readonly string[]): JsonSchema {
  if (terms.length === 0) {
    return { type: 'array', maxItems: 0 };
  }
  return {
    type: 'array',
    items: { type: 'string', enum: terms },
    minItems: Math.min(1, terms.length),
    maxItems: terms.length,
  };
}
