export type ContractStage = 'frame' | 'payload';

type ProviderDescriptorName = 'reference_frame' | 'concept_payload';

type ProviderSchemaExpectation =
  | Readonly<{
      readonly kind: 'required_properties';
      readonly descriptor: ProviderDescriptorName;
      readonly path: readonly string[];
      readonly properties: readonly string[];
    }>
  | Readonly<{
      readonly kind: 'validator_only';
      readonly descriptor: ProviderDescriptorName;
      readonly path: readonly string[];
    }>;

type RegressionFixtureClassification =
  'accepted_fixture' | 'validator_rejection' | 'planner_rejection';

type ContractInvariant = Readonly<{
  readonly id: string;
  readonly stage: ContractStage;
  readonly providerSchema: ProviderSchemaExpectation;
  readonly promptRequirement: string;
  readonly validatorPath: string;
  readonly repairStage: ContractStage;
  readonly regressionFixture: Readonly<{
    readonly classification: RegressionFixtureClassification;
    readonly file: string;
  }>;
}>;

const frameFixture = 'reference-frame.contract.spec.ts';
const payloadFixture = 'reference-frame.contract.spec.ts';
const plannerFixture = 'reference-frame-planner.validation.spec.ts';

function frameInvariant(
  id: string,
  providerSchema: ProviderSchemaExpectation,
  promptRequirement: string,
  validatorPath: string,
  classification: RegressionFixtureClassification = 'validator_rejection',
  fixture = frameFixture,
): ContractInvariant {
  return {
    id,
    stage: 'frame',
    providerSchema,
    promptRequirement,
    validatorPath,
    repairStage: 'frame',
    regressionFixture: { classification, file: fixture },
  };
}

function payloadInvariant(
  id: string,
  providerSchema: ProviderSchemaExpectation,
  promptRequirement: string,
  validatorPath: string,
  classification: RegressionFixtureClassification = 'validator_rejection',
  fixture = payloadFixture,
): ContractInvariant {
  return {
    id,
    stage: 'payload',
    providerSchema,
    promptRequirement,
    validatorPath,
    repairStage: 'payload',
    regressionFixture: { classification, file: fixture },
  };
}

export const REFERENCE_CONTRACT_INVARIANTS = [
  frameInvariant(
    'RF-OBJECT-SHAPE',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: [],
      properties: [
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
      ],
    },
    'Return only the complete strict ReferenceFrame object with no unknown fields.',
    'referenceFrame',
    'accepted_fixture',
  ),
  frameInvariant(
    'RF-SHELL',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['shell'],
      properties: [
        'kind',
        'requiresViewBlock',
        'requiresChoiceCombination',
        'requiresStructuredSource',
      ],
    },
    'Return the required document shell exactly.',
    'referenceFrame.shell',
  ),
  frameInvariant(
    'RF-SOURCE-IDENTITY',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['source'],
      properties: ['sourceId', 'sourceHash'],
    },
    'Copy the required source identity exactly.',
    'referenceFrame.source',
  ),
  frameInvariant(
    'RF-SUBJECT-AND-RANGE',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['unitRange'],
      properties: ['start', 'end'],
    },
    'Preserve the required subject and unit range exactly.',
    'referenceFrame.unitRange',
  ),
  frameInvariant(
    'RF-STEM-STRUCTURE',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['stem'],
      properties: ['style', 'polarity', 'languageSignals'],
    },
    'Provide a non-empty stem style, polarity, and language signals.',
    'referenceFrame.stem',
  ),
  frameInvariant(
    'RF-RESPONSE-STRUCTURE',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['response'],
      properties: [
        'mode',
        'choiceEncoding',
        'choiceCount',
        'viewItemCount',
        'choiceTopology',
        'combinationPlan',
      ],
    },
    'Preserve a supported response mode, its matching choice encoding, five choices, response topology, combination plan, and a non-negative view-item count.',
    'referenceFrame.response',
  ),
  frameInvariant(
    'RF-COMBINATION-PLAN',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['response', 'combinationPlan'],
      properties: ['expectedAnswerCount', 'optionCount', 'topology'],
    },
    'Provide a combination plan matching the selected archetype and response topology.',
    'referenceFrame.response.combinationPlan',
  ),
  frameInvariant(
    'RF-MATERIAL-DENSITY',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['materialDensity'],
      properties: [
        'targetLength',
        'paragraphCount',
        'namedEntities',
        'numericFacts',
        'conditionCount',
      ],
    },
    'Provide positive target length and non-negative material-density counts.',
    'referenceFrame.materialDensity',
  ),
  frameInvariant(
    'RF-SHAPE-AND-DIFFICULTY',
    {
      kind: 'validator_only',
      descriptor: 'reference_frame',
      path: ['informationShape'],
    },
    'Use a supported information shape and at least one non-empty difficulty signal.',
    'referenceFrame.informationShape',
  ),
  frameInvariant(
    'RF-SEMANTIC-ATOM-SHAPE',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['semanticAtoms', 'items'],
      properties: [
        'id',
        'subjectSlot',
        'predicateKind',
        'operator',
        'objectSlot',
        'quantityRole',
        'polarity',
      ],
    },
    'Use unique atom_* ids and supported semantic atom values.',
    'referenceFrame.semanticAtoms',
  ),
  frameInvariant(
    'RF-SEMANTIC-COMPATIBILITY',
    {
      kind: 'validator_only',
      descriptor: 'reference_frame',
      path: ['semanticAtoms', 'items'],
    },
    'Use a conditional operator only with conditional-capable predicate kinds.',
    'referenceFrame.semanticAtoms',
  ),
  frameInvariant(
    'RF-BLUEPRINT-SHAPE',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['structureBlueprint'],
      properties: [
        'informationUnits',
        'relations',
        'reasoningSteps',
        'itemRoles',
        'evidenceBlocks',
      ],
    },
    'Provide the complete structure blueprint with information units, relations, reasoning steps, and item roles.',
    'referenceFrame.structureBlueprint',
  ),
  frameInvariant(
    'RF-BLUEPRINT-INFORMATION-UNITS',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['structureBlueprint', 'informationUnits', 'items'],
      properties: ['id', 'order', 'kind', 'atomIds'],
    },
    'Use unique ordered unit_* ids, supported unit kinds, and only existing semantic atom ids.',
    'referenceFrame.structureBlueprint.informationUnits',
  ),
  frameInvariant(
    'RF-BLUEPRINT-RELATIONS',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['structureBlueprint', 'relations', 'items'],
      properties: ['kind', 'fromUnitId', 'toUnitId'],
    },
    'Use supported forward relations between existing units; every condition and exception unit must have an outgoing relation and relations must be acyclic.',
    'referenceFrame.structureBlueprint.relations',
  ),
  frameInvariant(
    'RF-BLUEPRINT-REASONING-STEPS',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['structureBlueprint', 'reasoningSteps', 'items'],
      properties: ['id', 'order', 'operation', 'unitIds', 'dependsOnStepIds'],
    },
    'Use unique ordered step_* ids, supported operations, existing unit ids, and only earlier unique step dependencies.',
    'referenceFrame.structureBlueprint.reasoningSteps',
  ),
  frameInvariant(
    'RF-BLUEPRINT-ITEM-ROLES',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['structureBlueprint', 'itemRoles', 'items'],
      properties: [
        'itemKind',
        'itemIndex',
        'role',
        'unitIds',
        'reasoningStepIds',
      ],
    },
    'Use supported choice or view-item roles with unique in-range indexes and existing unit and reasoning-step references.',
    'referenceFrame.structureBlueprint.itemRoles',
  ),
  frameInvariant(
    'RF-BLUEPRINT-EVIDENCE-BLOCKS',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['structureBlueprint', 'evidenceBlocks', 'items'],
      properties: [
        'itemKind',
        'itemIndex',
        'role',
        'unitIds',
        'reasoningStepIds',
      ],
    },
    'Provide one ordered evidence block for every item role.',
    'referenceFrame.structureBlueprint.evidenceBlocks',
  ),
  frameInvariant(
    'RF-GROUNDING-LEXICON-SHAPE',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['groundingLexicon'],
      properties: ['entities', 'quantities', 'rules', 'bindings'],
    },
    'Provide entities, quantities, rules, and bindings with no unknown fields.',
    'referenceFrame.groundingLexicon',
  ),
  frameInvariant(
    'RF-GROUNDING-ENTITIES',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['groundingLexicon', 'entities', 'items'],
      properties: ['slot', 'class'],
    },
    'Use unique supported entity slots and classes.',
    'referenceFrame.groundingLexicon.entities',
  ),
  frameInvariant(
    'RF-GROUNDING-QUANTITIES',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['groundingLexicon', 'quantities', 'items'],
      properties: ['id', 'role', 'value', 'unit'],
    },
    'Use unique quantity_* ids, finite numeric values, supported units, and compatible quantity roles.',
    'referenceFrame.groundingLexicon.quantities',
  ),
  frameInvariant(
    'RF-GROUNDING-RULES',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['groundingLexicon', 'rules', 'items'],
      properties: ['id', 'conceptId', 'polarity'],
    },
    'Use unique rule_* ids, concept_* ids, and boolean polarity.',
    'referenceFrame.groundingLexicon.rules',
  ),
  frameInvariant(
    'RF-GROUNDING-BINDINGS',
    {
      kind: 'required_properties',
      descriptor: 'reference_frame',
      path: ['groundingLexicon', 'bindings', 'items'],
      properties: ['atomId', 'entitySlots', 'quantityIds', 'ruleIds'],
    },
    'Create exactly one binding for every atom. Bind only existing references, include each atom subject and object slot, and match quantity roles.',
    'referenceFrame.groundingLexicon.bindings',
  ),
  frameInvariant(
    'RF-PLANNER-CONTEXT',
    {
      kind: 'validator_only',
      descriptor: 'reference_frame',
      path: [],
    },
    'Match the requested source, subject, unit range, supported planner response modes, and catalog rule concept ids.',
    'ReferenceFramePlannerService.frameReason',
    'planner_rejection',
    plannerFixture,
  ),
  payloadInvariant(
    'CP-OBJECT-SHAPE',
    {
      kind: 'required_properties',
      descriptor: 'concept_payload',
      path: [],
      properties: [
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
      ],
    },
    'Return only the complete strict ConceptPayload object with no unknown fields.',
    'conceptPayload',
    'accepted_fixture',
  ),
  payloadInvariant(
    'CP-SOURCE-AND-SCOPE',
    {
      kind: 'required_properties',
      descriptor: 'concept_payload',
      path: ['unitRange'],
      properties: ['start', 'end'],
    },
    'Preserve the required source, subject, and unit range exactly.',
    'conceptPayload.unitRange',
  ),
  payloadInvariant(
    'CP-SOURCE-IDENTITY',
    {
      kind: 'required_properties',
      descriptor: 'concept_payload',
      path: ['source'],
      properties: ['sourceId', 'sourceHash'],
    },
    'Copy the required source identity exactly.',
    'conceptPayload.source',
  ),
  payloadInvariant(
    'CP-ELIGIBLE-UNITS',
    {
      kind: 'validator_only',
      descriptor: 'concept_payload',
      path: ['eligibleUnits'],
    },
    'Use non-empty, unique eligible units within the required unit range.',
    'conceptPayload.eligibleUnits',
  ),
  payloadInvariant(
    'CP-CONCEPT-IDS',
    {
      kind: 'validator_only',
      descriptor: 'concept_payload',
      path: ['targetConceptIds'],
    },
    'Use unique concept_* ids from allowedConcepts only.',
    'conceptPayload.targetConceptIds',
  ),
  payloadInvariant(
    'CP-CONCEPT-CARDINALITY',
    {
      kind: 'validator_only',
      descriptor: 'concept_payload',
      path: ['targetConceptIds'],
    },
    'Use exactly one target concept and at most two supporting concepts.',
    'ReferenceFramePlannerService.payloadReason',
    'planner_rejection',
    plannerFixture,
  ),
  payloadInvariant(
    'CP-DISTRACTOR-AXES',
    {
      kind: 'validator_only',
      descriptor: 'concept_payload',
      path: ['distractorAxes'],
    },
    'Use non-empty distractor axes from the allowed catalog and never reuse a reference distractor axis.',
    'ReferenceFramePlannerService.payloadReason',
    'planner_rejection',
    plannerFixture,
  ),
  payloadInvariant(
    'CP-ANSWER-PLAN-SHAPE',
    {
      kind: 'required_properties',
      descriptor: 'concept_payload',
      path: ['answerPlan'],
      properties: [
        'responseMode',
        'choiceEncoding',
        'expectedAnswerCount',
        'options',
      ],
    },
    'Provide a complete answer plan with supported response mode and matching choice encoding.',
    'conceptPayload.answerPlan',
  ),
  payloadInvariant(
    'CP-ANSWER-PLAN-OPTIONS',
    {
      kind: 'required_properties',
      descriptor: 'concept_payload',
      path: ['answerPlan', 'options', 'items'],
      properties: ['id', 'verdict', 'atomIds'],
    },
    'Use unique option_* ids, boolean verdicts, unique atom_* ids, and exactly expectedAnswerCount options.',
    'conceptPayload.answerPlan.options',
  ),
  payloadInvariant(
    'CP-ANSWER-PLAN-FRAME-COMPATIBILITY',
    {
      kind: 'validator_only',
      descriptor: 'concept_payload',
      path: ['answerPlan'],
    },
    'Match the required frame response mode and choice encoding, reference only frame atom ids, and match truth-combination claim cardinality.',
    'ReferenceFramePlannerService.payloadReason',
    'planner_rejection',
    plannerFixture,
  ),
  payloadInvariant(
    'CP-REQUIRED-SHAPE-AND-NOVELTY',
    {
      kind: 'validator_only',
      descriptor: 'concept_payload',
      path: ['requiredInformationShape'],
    },
    'Use a supported required information shape and at least one non-empty novelty rule.',
    'conceptPayload.requiredInformationShape',
  ),
] as const satisfies readonly ContractInvariant[];

export function invariantPromptRequirementsFor(
  stage: ContractStage,
): readonly Readonly<{ readonly id: string; readonly rule: string }>[] {
  return REFERENCE_CONTRACT_INVARIANTS.filter(
    (invariant) => invariant.stage === stage,
  ).map((invariant) => ({
    id: invariant.id,
    rule: invariant.promptRequirement,
  }));
}

export function providerSchemaRequirementsFor(
  descriptor: ProviderDescriptorName,
): readonly ContractInvariant[] {
  return REFERENCE_CONTRACT_INVARIANTS.filter(
    (invariant) => invariant.providerSchema.descriptor === descriptor,
  );
}

export function providerRequiredPropertiesFor(
  descriptor: ProviderDescriptorName,
  path: readonly string[],
): readonly string[] {
  const invariant = providerSchemaRequirementsFor(descriptor).find(
    (candidate) =>
      candidate.providerSchema.kind === 'required_properties' &&
      candidate.providerSchema.path.length === path.length &&
      candidate.providerSchema.path.every(
        (segment, index) => segment === path[index],
      ),
  );
  return invariant?.providerSchema.kind === 'required_properties'
    ? invariant.providerSchema.properties
    : [];
}

export function sharedProviderRequiredPropertiesFor(
  descriptors: readonly ProviderDescriptorName[],
  path: readonly string[],
): readonly string[] {
  return providerRequiredPropertiesFor(
    descriptors[0] ?? 'reference_frame',
    path,
  );
}
