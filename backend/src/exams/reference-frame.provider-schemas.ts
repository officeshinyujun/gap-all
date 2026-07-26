import {
  CHOICE_ENCODINGS,
  GROUNDING_ENTITY_CLASSES,
  GROUNDING_QUANTITY_UNITS,
  INFORMATION_UNIT_KINDS,
  INFORMATION_SHAPES,
  ITEM_ROLE_KINDS,
  PREDICATE_KINDS,
  QUANTITY_ROLES,
  RELATION_KINDS,
  REASONING_OPERATIONS,
  RESPONSE_MODES,
  SEMANTIC_OPERATORS,
  SUBJECT_SLOTS,
  type ChoiceEncoding,
  type ResponseMode,
} from './reference-frame.types';
import {
  providerRequiredPropertiesFor,
  sharedProviderRequiredPropertiesFor,
} from './reference-contract-invariants';

export type ProviderJsonSchema =
  | ProviderArraySchema
  | ProviderBooleanSchema
  | ProviderIntegerSchema
  | ProviderNumberSchema
  | ProviderNullableStringSchema
  | ProviderObjectSchema
  | ProviderStringSchema;

type ProviderArraySchema = Readonly<{
  type: 'array';
  items: ProviderJsonSchema;
  minItems?: number;
  maxItems?: number;
}>;

type ProviderBooleanSchema = Readonly<{
  type: 'boolean';
}>;

type ProviderIntegerSchema = Readonly<{
  type: 'integer';
  minimum?: number;
  maximum?: number;
}>;

type ProviderNumberSchema = Readonly<{
  type: 'number';
}>;

export type ProviderObjectSchema = Readonly<{
  type: 'object';
  properties: Readonly<Record<string, ProviderJsonSchema>>;
  required: readonly string[];
  additionalProperties: false;
}>;

type ProviderStringSchema = Readonly<{
  type: 'string';
  minLength?: number;
  enum?: readonly string[];
  pattern?: string;
}>;

type ProviderNullableStringSchema = Readonly<{
  type: readonly ['string', 'null'];
  enum: readonly (string | null)[];
}>;

export type StructuredOutputDescriptor = Readonly<{
  name: string;
  strict: true;
  schema: ProviderObjectSchema;
}>;

const nonEmptyStringSchema = {
  type: 'string',
  minLength: 1,
} as const satisfies ProviderStringSchema;

const positiveIntegerSchema = {
  type: 'integer',
  minimum: 1,
} as const satisfies ProviderIntegerSchema;

const nonNegativeIntegerSchema = {
  type: 'integer',
  minimum: 0,
} as const satisfies ProviderIntegerSchema;

const referenceDocumentShellSchema = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: [
        'table',
        'case',
        'timeline',
        'dialogue',
        'document',
        'law_excerpt',
        'consultation_qna',
        'incident_report',
        'checklist',
        'investigation_report',
        'dashboard',
        'classroom_board',
        'plain',
      ],
    },
    requiresViewBlock: { type: 'boolean' },
    requiresChoiceCombination: { type: 'boolean' },
    requiresStructuredSource: { type: 'boolean' },
  },
  required: providerRequiredPropertiesFor('reference_frame', ['shell']),
  additionalProperties: false,
} as const satisfies ProviderObjectSchema;

const sourceIdentitySchema = {
  type: 'object',
  properties: {
    sourceId: nonEmptyStringSchema,
    sourceHash: nonEmptyStringSchema,
  },
  required: sharedProviderRequiredPropertiesFor(
    ['reference_frame', 'concept_payload'],
    ['source'],
  ),
  additionalProperties: false,
} as const satisfies ProviderObjectSchema;

const unitRangeSchema = {
  type: 'object',
  properties: {
    start: positiveIntegerSchema,
    end: positiveIntegerSchema,
  },
  required: sharedProviderRequiredPropertiesFor(
    ['reference_frame', 'concept_payload'],
    ['unitRange'],
  ),
  additionalProperties: false,
} as const satisfies ProviderObjectSchema;

const subjectSchema = {
  type: 'string',
  enum: ['success', 'kongil'],
} as const satisfies ProviderStringSchema;

const informationShapeSchema = {
  type: 'string',
  enum: [...INFORMATION_SHAPES],
} as const satisfies ProviderStringSchema;

const choiceEncodingSchema = {
  type: 'string',
  enum: [...CHOICE_ENCODINGS],
} as const satisfies ProviderStringSchema;

const nonEmptyStringArraySchema = {
  type: 'array',
  items: nonEmptyStringSchema,
  minItems: 1,
} as const satisfies ProviderArraySchema;

const unitIdentifierSchema = {
  type: 'string',
  pattern: '^unit_[1-9][0-9]*$',
} as const satisfies ProviderStringSchema;

const stepIdentifierSchema = {
  type: 'string',
  pattern: '^step_[1-9][0-9]*$',
} as const satisfies ProviderStringSchema;

const atomIdentifierSchema = {
  type: 'string',
  pattern: '^atom_[a-z0-9_]+$',
} as const satisfies ProviderStringSchema;

const conceptIdentifierSchema = {
  type: 'string',
  pattern: '^concept_[a-z0-9_]+$',
} as const satisfies ProviderStringSchema;

const quantityIdentifierSchema = {
  type: 'string',
  pattern: '^quantity_[a-z0-9_]+$',
} as const satisfies ProviderStringSchema;

const ruleIdentifierSchema = {
  type: 'string',
  pattern: '^rule_[a-z0-9_]+$',
} as const satisfies ProviderStringSchema;

const referenceStructureBlueprintSchema = {
  type: 'object',
  properties: {
    informationUnits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: unitIdentifierSchema,
          order: positiveIntegerSchema,
          kind: { type: 'string', enum: [...INFORMATION_UNIT_KINDS] },
          atomIds: { type: 'array', items: atomIdentifierSchema, minItems: 1 },
        },
        required: providerRequiredPropertiesFor('reference_frame', [
          'structureBlueprint',
          'informationUnits',
          'items',
        ]),
        additionalProperties: false,
      },
      minItems: 1,
    },
    relations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: [...RELATION_KINDS] },
          fromUnitId: unitIdentifierSchema,
          toUnitId: unitIdentifierSchema,
        },
        required: providerRequiredPropertiesFor('reference_frame', [
          'structureBlueprint',
          'relations',
          'items',
        ]),
        additionalProperties: false,
      },
    },
    reasoningSteps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: stepIdentifierSchema,
          order: positiveIntegerSchema,
          operation: { type: 'string', enum: [...REASONING_OPERATIONS] },
          unitIds: { type: 'array', items: unitIdentifierSchema, minItems: 1 },
          dependsOnStepIds: { type: 'array', items: stepIdentifierSchema },
        },
        required: providerRequiredPropertiesFor('reference_frame', [
          'structureBlueprint',
          'reasoningSteps',
          'items',
        ]),
        additionalProperties: false,
      },
      minItems: 1,
    },
    itemRoles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          itemKind: { type: 'string', enum: ['choice', 'view_item'] },
          itemIndex: positiveIntegerSchema,
          role: { type: 'string', enum: [...ITEM_ROLE_KINDS] },
          unitIds: { type: 'array', items: unitIdentifierSchema, minItems: 1 },
          reasoningStepIds: {
            type: 'array',
            items: stepIdentifierSchema,
            minItems: 1,
          },
        },
        required: providerRequiredPropertiesFor('reference_frame', [
          'structureBlueprint',
          'itemRoles',
          'items',
        ]),
        additionalProperties: false,
      },
      minItems: 1,
    },
    evidenceBlocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          itemKind: { type: 'string', enum: ['choice', 'view_item'] },
          itemIndex: positiveIntegerSchema,
          role: { type: 'string', enum: [...ITEM_ROLE_KINDS] },
          unitIds: { type: 'array', items: unitIdentifierSchema },
          reasoningStepIds: { type: 'array', items: stepIdentifierSchema },
        },
        required: providerRequiredPropertiesFor('reference_frame', [
          'structureBlueprint',
          'evidenceBlocks',
          'items',
        ]),
        additionalProperties: false,
      },
    },
  },
  required: providerRequiredPropertiesFor('reference_frame', [
    'structureBlueprint',
  ]),
  additionalProperties: false,
} as const satisfies ProviderObjectSchema;

const semanticAtomSchema = {
  type: 'object',
  properties: {
    id: atomIdentifierSchema,
    subjectSlot: { type: 'string', enum: [...SUBJECT_SLOTS] },
    predicateKind: { type: 'string', enum: [...PREDICATE_KINDS] },
    operator: { type: 'string', enum: [...SEMANTIC_OPERATORS] },
    objectSlot: { type: ['string', 'null'], enum: [...SUBJECT_SLOTS, null] },
    quantityRole: { type: ['string', 'null'], enum: [...QUANTITY_ROLES, null] },
    polarity: { type: 'boolean' },
  },
  required: providerRequiredPropertiesFor('reference_frame', [
    'semanticAtoms',
    'items',
  ]),
  additionalProperties: false,
} as const satisfies ProviderObjectSchema;

const groundingLexiconSchema = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slot: { type: 'string', enum: [...SUBJECT_SLOTS] },
          class: { type: 'string', enum: [...GROUNDING_ENTITY_CLASSES] },
        },
        required: providerRequiredPropertiesFor('reference_frame', [
          'groundingLexicon',
          'entities',
          'items',
        ]),
        additionalProperties: false,
      },
    },
    quantities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: quantityIdentifierSchema,
          role: { type: ['string', 'null'], enum: [...QUANTITY_ROLES, null] },
          value: { type: 'number' },
          unit: { type: 'string', enum: [...GROUNDING_QUANTITY_UNITS] },
        },
        required: providerRequiredPropertiesFor('reference_frame', [
          'groundingLexicon',
          'quantities',
          'items',
        ]),
        additionalProperties: false,
      },
    },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: ruleIdentifierSchema,
          conceptId: conceptIdentifierSchema,
          polarity: { type: 'boolean' },
        },
        required: providerRequiredPropertiesFor('reference_frame', [
          'groundingLexicon',
          'rules',
          'items',
        ]),
        additionalProperties: false,
      },
    },
    bindings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          atomId: atomIdentifierSchema,
          entitySlots: {
            type: 'array',
            items: { type: 'string', enum: [...SUBJECT_SLOTS] },
          },
          quantityIds: { type: 'array', items: quantityIdentifierSchema },
          ruleIds: { type: 'array', items: ruleIdentifierSchema },
        },
        required: providerRequiredPropertiesFor('reference_frame', [
          'groundingLexicon',
          'bindings',
          'items',
        ]),
        additionalProperties: false,
      },
    },
  },
  required: providerRequiredPropertiesFor('reference_frame', [
    'groundingLexicon',
  ]),
  additionalProperties: false,
} as const satisfies ProviderObjectSchema;

const answerPlanSchema = {
  type: 'object',
  properties: {
    responseMode: { type: 'string', enum: [...RESPONSE_MODES] },
    choiceEncoding: choiceEncodingSchema,
    expectedAnswerCount: positiveIntegerSchema,
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^option_[a-z0-9_]+$' },
          verdict: { type: 'boolean' },
          atomIds: { type: 'array', items: atomIdentifierSchema, minItems: 1 },
        },
        required: providerRequiredPropertiesFor('concept_payload', [
          'answerPlan',
          'options',
          'items',
        ]),
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  required: providerRequiredPropertiesFor('concept_payload', ['answerPlan']),
  additionalProperties: false,
} as const satisfies ProviderObjectSchema;

function freezeDescriptor<T extends StructuredOutputDescriptor>(
  descriptor: T,
): Readonly<T> {
  for (const value of Object.values(descriptor)) {
    if (value !== null && typeof value === 'object') {
      freezeDescriptorValue(value);
    }
  }
  return Object.freeze(descriptor);
}

function freezeDescriptorValue(value: object): void {
  for (const nestedValue of Object.values(value)) {
    if (nestedValue !== null && typeof nestedValue === 'object') {
      freezeDescriptorValue(nestedValue);
    }
  }
  Object.freeze(value);
}

export const referenceFrameStructuredOutput = freezeDescriptor({
  name: 'reference_frame',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      source: sourceIdentitySchema,
      subject: subjectSchema,
      unitRange: unitRangeSchema,
      stem: {
        type: 'object',
        properties: {
          style: nonEmptyStringSchema,
          polarity: { type: 'string', enum: ['positive', 'negative'] },
          languageSignals: nonEmptyStringArraySchema,
        },
        required: providerRequiredPropertiesFor('reference_frame', ['stem']),
        additionalProperties: false,
      },
      response: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: [...RESPONSE_MODES] },
          choiceEncoding: choiceEncodingSchema,
          choiceCount: { type: 'integer', minimum: 5, maximum: 5 },
          viewItemCount: nonNegativeIntegerSchema,
          choiceTopology: {
            type: 'string',
            enum: [
              'combo_sets',
              'single_choice',
              'label_key',
              'pair_key',
              'blank_key',
            ],
          },
          combinationPlan: {
            type: 'object',
            properties: {
              expectedAnswerCount: {
                type: 'integer',
                minimum: 1,
              },
              optionCount: { type: 'integer', minimum: 5, maximum: 5 },
              topology: {
                type: 'string',
                enum: [
                  'combo_sets',
                  'single_choice',
                  'label_key',
                  'pair_key',
                  'blank_key',
                ],
              },
            },
            required: providerRequiredPropertiesFor('reference_frame', [
              'response',
              'combinationPlan',
            ]),
            additionalProperties: false,
          },
        },
        required: providerRequiredPropertiesFor('reference_frame', [
          'response',
        ]),
        additionalProperties: false,
      },
      shell: referenceDocumentShellSchema,
      materialDensity: {
        type: 'object',
        properties: {
          targetLength: positiveIntegerSchema,
          paragraphCount: nonNegativeIntegerSchema,
          namedEntities: nonNegativeIntegerSchema,
          numericFacts: nonNegativeIntegerSchema,
          conditionCount: nonNegativeIntegerSchema,
        },
        required: providerRequiredPropertiesFor('reference_frame', [
          'materialDensity',
        ]),
        additionalProperties: false,
      },
      informationShape: informationShapeSchema,
      difficultySignals: nonEmptyStringArraySchema,
      structureBlueprint: referenceStructureBlueprintSchema,
      semanticAtoms: { type: 'array', items: semanticAtomSchema, minItems: 1 },
      groundingLexicon: groundingLexiconSchema,
    },
    required: providerRequiredPropertiesFor('reference_frame', []),
    additionalProperties: false,
  },
} as const satisfies StructuredOutputDescriptor);

export const conceptPayloadStructuredOutput = freezeDescriptor({
  name: 'concept_payload',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      source: sourceIdentitySchema,
      subject: subjectSchema,
      unitRange: unitRangeSchema,
      eligibleUnits: {
        type: 'array',
        items: positiveIntegerSchema,
        minItems: 1,
      },
      targetConceptIds: {
        type: 'array',
        items: conceptIdentifierSchema,
        minItems: 1,
      },
      supportingConceptIds: {
        type: 'array',
        items: conceptIdentifierSchema,
      },
      distractorAxes: nonEmptyStringArraySchema,
      answerPlan: answerPlanSchema,
      requiredInformationShape: informationShapeSchema,
      noveltyRules: nonEmptyStringArraySchema,
    },
    required: providerRequiredPropertiesFor('concept_payload', []),
    additionalProperties: false,
  },
} as const satisfies StructuredOutputDescriptor);

export function conceptPayloadStructuredOutputFor(
  allowedConceptIds: readonly string[],
  response?: Readonly<{
    mode: ResponseMode;
    choiceEncoding: ChoiceEncoding;
    choiceCount: number;
    viewItemCount: number;
  }>,
  unitRange?: Readonly<{ start: number; end: number }>,
  conceptRoleCardinality?: Readonly<{ target: number; supporting: number }>,
): StructuredOutputDescriptor {
  const allowedConceptSchema = {
    type: 'string',
    enum: [...allowedConceptIds],
  } as const satisfies ProviderStringSchema;
  const constrainedAnswerPlanSchema =
    response === undefined
      ? answerPlanSchema
      : {
          ...answerPlanSchema,
          properties: {
            ...answerPlanSchema.properties,
            responseMode: { type: 'string' as const, enum: [response.mode] },
            choiceEncoding: {
              type: 'string' as const,
              enum: [response.choiceEncoding],
            },
            expectedAnswerCount: {
              type: 'integer' as const,
              minimum:
                response.mode === 'truth_combination'
                  ? response.viewItemCount
                  : response.choiceCount,
              maximum:
                response.mode === 'truth_combination'
                  ? response.viewItemCount
                  : response.choiceCount,
            },
            options: {
              ...answerPlanSchema.properties.options,
              minItems:
                response.mode === 'truth_combination'
                  ? response.viewItemCount
                  : response.choiceCount,
              maxItems:
                response.mode === 'truth_combination'
                  ? response.viewItemCount
                  : response.choiceCount,
            },
          },
        };
  return freezeDescriptor({
    name: 'concept_payload',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        source: sourceIdentitySchema,
        subject: subjectSchema,
        unitRange: unitRangeSchema,
        eligibleUnits: {
          type: 'array',
          items:
            unitRange === undefined
              ? positiveIntegerSchema
              : {
                  type: 'integer',
                  minimum: unitRange.start,
                  maximum: unitRange.end,
                },
          minItems: 1,
        },
        targetConceptIds: {
          type: 'array',
          items: allowedConceptSchema,
          minItems: conceptRoleCardinality?.target ?? 1,
          maxItems: conceptRoleCardinality?.target ?? 1,
        },
        supportingConceptIds: {
          type: 'array',
          items: allowedConceptSchema,
          minItems:
            conceptRoleCardinality === undefined
              ? 0
              : conceptRoleCardinality.supporting > 0
                ? 1
                : 0,
          maxItems: conceptRoleCardinality?.supporting ?? 2,
        },
        distractorAxes: nonEmptyStringArraySchema,
        answerPlan: constrainedAnswerPlanSchema,
        requiredInformationShape: informationShapeSchema,
        noveltyRules: nonEmptyStringArraySchema,
      },
      required: providerRequiredPropertiesFor('concept_payload', []),
      additionalProperties: false,
    },
  } as const satisfies StructuredOutputDescriptor);
}
