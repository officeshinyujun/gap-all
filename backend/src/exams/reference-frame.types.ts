export const INFORMATION_SHAPES = [
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

export const RESPONSE_MODES = [
  'truth_combination',
  'single_selection',
  'label_matching',
  'pair_selection',
  'blank_workflow',
] as const;

export const CHOICE_ENCODINGS = [
  'truth_combination',
  'single_choice',
  'label_key',
  'pair_key',
  'blank_key',
] as const;

export const CONTRACT_REASON_CODES = [
  'INVALID_JSON',
  'INVALID_OBJECT',
  'UNKNOWN_FIELD',
  'MISSING_REQUIRED_FIELD',
  'MISSING_UNIT_RANGE',
  'INVALID_FIELD_VALUE',
  'INVALID_UNIT_RANGE',
  'UNSUPPORTED_RESPONSE_MODE',
  'INVALID_CHOICE_ENCODING',
  'PAYLOAD_ARCHETYPE_MISMATCH',
  'PAYLOAD_COMBINATION_PLAN_MISMATCH',
  'PAYLOAD_CONCEPT_ROLE_MISMATCH',
  'PAYLOAD_EVIDENCE_BLOCK_MISMATCH',
  'PAYLOAD_SHARED_SET_MISMATCH',
  'EMPTY_DISTRACTOR_AXES',
  'INVALID_STRUCTURE_BLUEPRINT',
  'INVALID_BLUEPRINT_IDENTIFIER',
  'DUPLICATE_BLUEPRINT_IDENTIFIER',
  'MISSING_BLUEPRINT_ORDER',
  'INVALID_BLUEPRINT_RELATION',
  'CYCLIC_BLUEPRINT_RELATION',
  'UNREFERENCED_BLUEPRINT_ROLE',
] as const;

export const INFORMATION_UNIT_KINDS = [
  'context',
  'fact',
  'condition',
  'exception',
  'conclusion',
] as const;

export const RELATION_KINDS = [
  'condition_of',
  'exception_to',
  'comparison_of',
  'sequence_before',
] as const;

export const REASONING_OPERATIONS = [
  'identify_condition',
  'apply_exception',
  'compare',
  'derive_conclusion',
] as const;

export const ITEM_ROLE_KINDS = [
  'correct',
  'condition_omission',
  'condition_reversal',
  'exception_omission',
  'irrelevant',
  'premise',
  'condition',
  'conclusion',
] as const;

export const SUBJECT_SLOTS = [
  'actor_a',
  'actor_b',
  'actor_c',
  'organization_a',
  'organization_b',
  'artifact_a',
  'process_a',
  'policy_a',
] as const;

export const PREDICATE_KINDS = [
  'has_status',
  'satisfies_condition',
  'violates_condition',
  'applies_rule',
  'produces_outcome',
  'compares',
  'requires',
  'excludes',
  'changes_quantity',
] as const;

export const SEMANTIC_OPERATORS = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'at_least',
  'at_most',
  'includes',
  'excludes',
  'before',
  'after',
  'conditional',
] as const;

export const QUANTITY_ROLES = [
  'threshold',
  'amount',
  'count',
  'rate',
  'duration',
  'sequence',
] as const;

export const GROUNDING_ENTITY_CLASSES = [
  'person',
  'organization',
  'artifact',
  'process',
  'policy',
] as const;

export const GROUNDING_QUANTITY_UNITS = [
  'won',
  'person',
  'hour',
  'percent',
  'count',
  'day',
  'month',
  'year',
  'ordinal',
] as const;

export type InformationShape = (typeof INFORMATION_SHAPES)[number];
export type ResponseMode = (typeof RESPONSE_MODES)[number];
export type ChoiceEncoding = (typeof CHOICE_ENCODINGS)[number];
export type SubjectStyle = 'success' | 'kongil';
export type StemPolarity = 'positive' | 'negative';
export type ContractReasonCode = (typeof CONTRACT_REASON_CODES)[number];
export type InformationUnitKind = (typeof INFORMATION_UNIT_KINDS)[number];
export type RelationKind = (typeof RELATION_KINDS)[number];
export type ReasoningOperation = (typeof REASONING_OPERATIONS)[number];
export type ItemRoleKind = (typeof ITEM_ROLE_KINDS)[number];
export type SubjectSlot = (typeof SUBJECT_SLOTS)[number];
export type PredicateKind = (typeof PREDICATE_KINDS)[number];
export type SemanticOperator = (typeof SEMANTIC_OPERATORS)[number];
export type QuantityRole = (typeof QUANTITY_ROLES)[number] | null;
export type GroundingEntityClass = (typeof GROUNDING_ENTITY_CLASSES)[number];
export type GroundingQuantityUnit = (typeof GROUNDING_QUANTITY_UNITS)[number];

export type SourceIdentity = Readonly<{
  sourceId: string;
  sourceHash: string;
}>;

export type UnitRange = Readonly<{
  start: number;
  end: number;
}>;

export type MaterialDensity = Readonly<{
  targetLength: number;
  paragraphCount: number;
  namedEntities: number;
  numericFacts: number;
  conditionCount: number;
}>;

export type StemStructure = Readonly<{
  style: string;
  polarity: StemPolarity;
  languageSignals: readonly string[];
}>;

export type ReferenceMaterialKind =
  | 'table'
  | 'case'
  | 'timeline'
  | 'dialogue'
  | 'document'
  | 'law_excerpt'
  | 'consultation_qna'
  | 'incident_report'
  | 'checklist'
  | 'investigation_report'
  | 'dashboard'
  | 'classroom_board'
  | 'plain';

export type ReferenceReasoningPattern =
  | 'comparison'
  | 'condition_flow'
  | 'role_dialogue'
  | 'case_profile'
  | 'document_rules';

export type ReferenceChoiceTopology =
  'combo_sets' | 'single_choice' | 'label_key' | 'pair_key' | 'blank_key';

export type ReferenceDocumentShell = Readonly<{
  kind: ReferenceMaterialKind;
  requiresViewBlock: boolean;
  requiresChoiceCombination: boolean;
  requiresStructuredSource: boolean;
}>;

export type ReferenceRegister = Readonly<{
  materialKind: ReferenceMaterialKind;
  reasoningPattern: ReferenceReasoningPattern;
  choiceTopology: ReferenceChoiceTopology;
  shell: ReferenceDocumentShell;
}>;

export type EvidenceBlock = Readonly<{
  itemKind: 'choice' | 'view_item';
  itemIndex: number;
  role: ItemRoleKind;
  unitIds: readonly string[];
  reasoningStepIds: readonly string[];
}>;

export type MultiConceptRole = ItemRoleKind;

export type DistractorTransformation =
  'omission' | 'reversal' | 'exception_omission' | 'irrelevant';

export type CombinationPlan = Readonly<{
  expectedAnswerCount: number;
  optionCount: number;
  topology: ReferenceChoiceTopology;
}>;

export type ReferenceConceptRoleCardinality = Readonly<{
  target: 1;
  supporting: number;
}>;

export type OptionalSetStructure = Readonly<{
  required: boolean;
  position: 'standalone' | 'shared_primary' | 'shared_pair';
  viewItemCount: number;
}>;

export type ResponseStructure = Readonly<{
  mode: ResponseMode;
  choiceEncoding: ChoiceEncoding;
  choiceCount: number;
  viewItemCount: number;
  choiceTopology: ReferenceChoiceTopology;
  combinationPlan: CombinationPlan;
}>;

export type ReferenceStructureBlueprint = Readonly<{
  informationUnits: readonly Readonly<{
    id: string;
    order: number;
    kind: InformationUnitKind;
    atomIds: readonly string[];
  }>[];
  relations: readonly Readonly<{
    kind: RelationKind;
    fromUnitId: string;
    toUnitId: string;
  }>[];
  reasoningSteps: readonly Readonly<{
    id: string;
    order: number;
    operation: ReasoningOperation;
    unitIds: readonly string[];
    dependsOnStepIds: readonly string[];
  }>[];
  itemRoles: readonly Readonly<{
    itemKind: 'choice' | 'view_item';
    itemIndex: number;
    role: ItemRoleKind;
    unitIds: readonly string[];
    reasoningStepIds: readonly string[];
  }>[];
  evidenceBlocks: readonly EvidenceBlock[];
}>;

export type SemanticAtom = Readonly<{
  id: string;
  subjectSlot: SubjectSlot;
  predicateKind: PredicateKind;
  operator: SemanticOperator;
  objectSlot: SubjectSlot | null;
  quantityRole: QuantityRole;
  polarity: boolean;
}>;

export type GroundingLexicon = Readonly<{
  entities: readonly Readonly<{
    slot: SubjectSlot;
    class: GroundingEntityClass;
  }>[];
  quantities: readonly Readonly<{
    id: string;
    role: QuantityRole;
    value: number;
    unit: GroundingQuantityUnit;
  }>[];
  rules: readonly Readonly<{
    id: string;
    conceptId: string;
    polarity: boolean;
  }>[];
  bindings: readonly Readonly<{
    atomId: string;
    entitySlots: readonly SubjectSlot[];
    quantityIds: readonly string[];
    ruleIds: readonly string[];
  }>[];
}>;

export type AnswerPlan = Readonly<{
  responseMode: ResponseMode;
  choiceEncoding: ChoiceEncoding;
  expectedAnswerCount: number;
  options: readonly Readonly<{
    id: string;
    verdict: boolean;
    atomIds: readonly string[];
  }>[];
}>;

export type ReferenceFrame = Readonly<{
  source: SourceIdentity;
  subject: SubjectStyle;
  unitRange: UnitRange;
  archetype: ReferenceArchetype;
  stem: StemStructure;
  response: ResponseStructure;
  shell: ReferenceDocumentShell;
  materialDensity: MaterialDensity;
  informationShape: InformationShape;
  difficultySignals: readonly string[];
  structureBlueprint: ReferenceStructureBlueprint;
  semanticAtoms: readonly SemanticAtom[];
  groundingLexicon: GroundingLexicon;
}>;

export type ConceptPayload = Readonly<{
  source: SourceIdentity;
  subject: SubjectStyle;
  unitRange: UnitRange;
  eligibleUnits: readonly number[];
  targetConceptIds: readonly string[];
  supportingConceptIds: readonly string[];
  distractorAxes: readonly string[];
  answerPlan: AnswerPlan;
  requiredInformationShape: InformationShape;
  noveltyRules: readonly string[];
}>;

export type ReferenceCandidate = Readonly<{
  source: SourceIdentity;
  subject: SubjectStyle;
  unitRange: UnitRange;
  frame: ReferenceFrame;
}>;

export type ReferenceFrameGenerationLineage = Readonly<{
  generationPath: 'reference_frame';
  source: SourceIdentity;
  archetype: ReferenceArchetype;
  frame: ReferenceFrame;
  payload: ConceptPayload;
  selectedTemplate: string;
  fidelity: Readonly<{
    contractVersion: number;
    sourceHash: string;
    response: Readonly<{
      choiceCount: number;
      viewItemCount: number;
      choiceTopology: ReferenceChoiceTopology;
      responseMode: ResponseMode;
    }>;
    density: Readonly<{
      stimulusLength: number;
      paragraphCount: number;
      numericFactCount: number;
      conditionSignalCount: number;
    }>;
    receipt?: Readonly<{
      deterministic: 'passed';
      copyPolicy: 'passed';
      semanticVerifier: Readonly<{
        model: string;
        verdict: 'accepted';
        reasonCode: string;
      }>;
      retryCount: number;
    }>;
  }>;
  validation: 'passed';
}>;

export type SimplyReferenceGenerationLineage = Readonly<{
  generationPath: 'simply_reference';
  generationNonce: string;
  source: SourceIdentity;
  batchOrdinal: number;
  selectedTemplate: string;
  validation: 'passed';
}>;

export type QuestionGenerationLineage =
  ReferenceFrameGenerationLineage | SimplyReferenceGenerationLineage;

export type ContractValidationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: Readonly<{ code: ContractReasonCode; path: string }>;
    }>;

export {
  validateReferenceFrame,
  validateReferenceFrameJson,
} from './reference-frame.frame-validator';
export {
  validateConceptPayload,
  validateConceptPayloadAgainstArchetype,
  validateConceptPayloadJson,
} from './reference-frame.payload-validator';
import type { ReferenceArchetype } from './reference-archetype';
