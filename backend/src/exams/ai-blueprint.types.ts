export const AI_BLUEPRINT_CONTRACT_VERSION = 'v2' as const;
export const AI_BLUEPRINT_VERSION = 'v3' as const;
export const AI_BLUEPRINT_GENERATION_ENV =
  'ENABLE_AI_BLUEPRINT_GENERATION' as const;

export const AI_QUESTION_FAMILIES = ['concept', 'case', 'calculation'] as const;

export type AiQuestionFamily = (typeof AI_QUESTION_FAMILIES)[number];

export const AI_GENERATION_STAGES = [
  'queued',
  'profile',
  'blueprint',
  'candidate',
  'validation',
  'saving',
  'completed',
  'failed',
  'canceled',
] as const;

export type AiGenerationStage = (typeof AI_GENERATION_STAGES)[number];

export const AI_GENERATION_FAILURE_CODES = [
  'AI_FEATURE_DISABLED',
  'AI_PROFILE_UNAVAILABLE',
  'AI_UNSUPPORTED_FAMILY',
  'AI_BLUEPRINT_SHORTFALL',
  'AI_PROVIDER_TIMEOUT',
  'AI_PROVIDER_MALFORMED_OUTPUT',
  'AI_CANDIDATE_SCHEMA_INVALID',
  'AI_INVARIANT_MISMATCH',
  'AI_ANSWER_RULE_MISMATCH',
  'AI_DISTRACTOR_INVALID',
  'AI_EXPLANATION_MISMATCH',
  'AI_DUPLICATE_REJECTED',
  'AI_RENDER_REJECTED',
  'AI_RETRY_EXHAUSTED',
  'AI_JOB_TIMEOUT',
  'AI_JOB_CANCELED',
] as const;

export type AiGenerationFailureCode =
  (typeof AI_GENERATION_FAILURE_CODES)[number];

export type AiGenerationSourceEvidence = Readonly<{
  sourceId: string;
  sourceHash: string;
  unitNumber: number;
  normalizedStimulus?: string;
  archetypeFingerprint?: string;
}>;

export type AiGenerationInvariantFact = Readonly<{
  id: string;
  description: string;
}>;

export type AiReferenceAnalysis = Readonly<{
  stemIntent: string;
  reasoningPattern: string;
  invariantFacts: readonly AiGenerationInvariantFact[];
  mutableSlots: readonly AiGenerationMutableSlot[];
  answerRule: AiGenerationAnswerRule;
  distractorRules: readonly string[];
  stimulusRequired: true;
}>;

export type AiGenerationMutableSlot = Readonly<{
  name: string;
  kind: 'text' | 'enum' | 'integer' | 'decimal';
  allowedValues?: readonly string[];
}>;

export type AiGenerationAnswerRule = Readonly<{
  id: string;
  description: string;
}>;

export type AiGenerationDistractorRule = Readonly<{
  id: string;
  description: string;
}>;

export type AiConversationContract = Readonly<{
  participants: readonly Readonly<{
    id: string;
    name: string;
    role: string;
  }>[];
  speakerSequence: readonly string[];
  sceneKind: 'dialogue';
}>;

export type AiProviderTelemetry = Readonly<{
  model: string;
  promptHash: string;
  latencyMs: number;
  usage: Readonly<{
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }> | null;
}>;

export type AiQuestionBlueprint = Readonly<{
  id: string;
  family: AiQuestionFamily;
  subjectId: string;
  unitNumber: number;
  targetConcept: string;
  template: string;
  /** Canonical provider field for this enabled TPL; absent for case prose. */
  providerSlotField?: import('./ai-tpl-capabilities').ProviderSlotField;
  /** Fixed by the blueprint; never inferred from provider prose. */
  providerSlotCount?: number;
  /** Canonical source slots used to validate and materialize provider output. */
  sourceSlotTexts?: readonly string[];
  /** Certified source structure. The provider may describe it, never replace it. */
  sourceArchetype?: ReferenceArchetype;
  /** Certified source choices for structural encodings such as ㄱㄴㄷ. */
  sourceChoiceTexts?: readonly string[];
  conversationContract?: AiConversationContract;
  sourceFactAnchors?: readonly string[];
  caseContext?: string;
  variantOrdinal?: number;
  invariantFacts: readonly AiGenerationInvariantFact[];
  mutableSlots: readonly AiGenerationMutableSlot[];
  answerRule: AiGenerationAnswerRule;
  answerIndex: 1 | 2 | 3 | 4 | 5;
  distractorRule: AiGenerationDistractorRule;
  distractorConcepts: readonly string[];
  difficulty: string;
  sourceEvidence: readonly AiGenerationSourceEvidence[];
  blueprintVersion: string;
}>;

/**
 * Provider output is intentionally smaller than a persisted Question. The
 * provider must not be able to choose the answer, choices, stimulus DTO, or
 * lineage.
 */
export type AiQuestionCandidate = Readonly<{
  stemText: string;
  explanationText: string;
  /** Case choices are generated as prose; the server still owns the answer index. */
  choiceTexts?: readonly string[];
  /** Conversation text only; speaker IDs and order are server-owned. */
  messageTexts?: readonly string[];
  /** Structured TPL slots; shape and order stay server-owned. */
  cellTexts?: readonly string[];
  paragraphTexts?: readonly string[];
  detailTexts?: readonly string[];
  stepTexts?: readonly string[];
  /** Reserved template-specific slots; these templates remain disabled. */
  forumTexts?: readonly string[];
  sceneTexts?: readonly string[];
  promotionTexts?: readonly string[];
  incidentTexts?: readonly string[];
  reportTexts?: readonly string[];
  numericTexts?: readonly string[];
  telemetry?: AiProviderTelemetry;
}>;

export type AiCandidateRepairContext = Readonly<{
  failureReason: string;
  requiredAnchors: readonly string[];
}>;

export type AiGenerationProgress = Readonly<{
  stage: AiGenerationStage;
  completed: number;
  total: number;
  attempt: number;
  maxAttempts: number;
  accepted: number;
  rejected: number;
}>;

export type AiGenerationValidationResult = Readonly<{
  passed: boolean;
  validatorVersion: string;
  failureCode?: AiGenerationFailureCode;
  message?: string;
}>;
import type { ReferenceArchetype } from './reference-archetype';
