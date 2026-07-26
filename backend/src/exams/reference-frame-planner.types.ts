import type {
  ContractReasonCode,
  ConceptPayload,
  ReferenceFrame,
  SubjectStyle,
  UnitRange,
} from './reference-frame.types';
import type { ReferenceArchetype } from './reference-archetype';
import type {
  ProviderObjectSchema,
  StructuredOutputDescriptor,
} from './reference-frame.provider-schemas';
import type {
  NormalizedSourceReference,
  ReferenceSelectionResult,
  SelectedParsedReference,
} from './reference-selector.service';
import type { ReferenceJobDeadline } from './reference-job-deadline';

export const PLANNER_REASON_CODES = [
  'STALE_REFERENCE',
  'FRAME_SOURCE_MISMATCH',
  'FRAME_SCOPE_MISMATCH',
  'PAYLOAD_SOURCE_MISMATCH',
  'PAYLOAD_SCOPE_MISMATCH',
  'PAYLOAD_ANSWER_ENCODING_MISMATCH',
  'PAYLOAD_CONCEPT_CARDINALITY_MISMATCH',
  'PAYLOAD_CLAIM_CARDINALITY_MISMATCH',
  'CONCEPT_OUT_OF_SCOPE',
  'DISTRACTOR_AXIS_OUT_OF_CATALOG',
  'REFERENCE_CONCEPT_REUSE',
  'REFERENCE_SUPPORTING_CONCEPT_OUT_OF_SCOPE',
  'REFERENCE_AXIS_REUSE',
  'MODEL_TIMEOUT',
  'MODEL_TRANSIENT_FAILURE',
  'MODEL_REQUEST_FAILED',
  'MODEL_EMPTY_RESPONSE',
  'MODEL_STRUCTURED_OUTPUT_UNSUPPORTED',
  'MODEL_REFUSAL',
  'MODEL_TRUNCATED_RESPONSE',
] as const;

export type PlannerReasonCode =
  ContractReasonCode | (typeof PLANNER_REASON_CODES)[number];

export type ReferenceFramePlannerChatRequest = Readonly<{
  model: string;
  messages: {
    role: 'system' | 'user';
    content: string;
  }[];
  response_format:
    | Readonly<{ type: 'json_object' }>
    | Readonly<{
        type: 'json_schema';
        json_schema: Readonly<{
          name: string;
          strict: true;
          schema: ProviderObjectSchema;
        }>;
      }>;
  temperature: number;
}>;

export type ReferenceFramePlannerRequestOptions = Readonly<{
  signal?: AbortSignal;
}>;

export type ReferenceFramePlannerCompletion = Readonly<{
  choices: readonly Readonly<{
    message: Readonly<{ content: string | null; refusal?: string | null }>;
    finish_reason?: string | null;
  }>[];
}>;

export type ReferenceFramePlannerClient = Readonly<{
  chat: Readonly<{
    completions: Readonly<{
      create: (
        request: ReferenceFramePlannerChatRequest,
        options?: ReferenceFramePlannerRequestOptions,
      ) => Promise<ReferenceFramePlannerCompletion>;
    }>;
  }>;
}>;

export type SelectedReferenceSelection = Extract<
  ReferenceSelectionResult,
  { kind: 'selected' }
>;

export const REFERENCE_CONCEPT_RULE_TAGS = [
  'eligibility',
  'exception',
  'obligation',
  'comparison',
  'calculation',
  'sequence',
] as const;

export type ReferenceCatalogConcept = Readonly<{
  id: string;
  subject: SubjectStyle;
  unit: number;
  canonicalLabel: string;
  ruleTags: readonly (typeof REFERENCE_CONCEPT_RULE_TAGS)[number][];
}>;

export type ReferenceFramePlannerRequest = Readonly<{
  subject: SubjectStyle;
  unitRange: UnitRange;
  selection: SelectedReferenceSelection;
  reference: NormalizedSourceReference | SelectedParsedReference;
  archetype: ReferenceArchetype;
  referenceDistractorAxes: readonly string[];
  catalogConcepts: readonly ReferenceCatalogConcept[];
  requiredSourceConceptIds?: readonly string[];
  requiredSourceTargetConceptId?: string;
}>;

export type ReferenceFramePlannerDependencies = Readonly<{
  client: ReferenceFramePlannerClient;
  deadline?: ReferenceJobDeadline;
  model: string;
  maxAttempts: number;
  timeoutMs: number;
  retryDelayMs: number;
}>;

export type PlannerStructuredOutput = StructuredOutputDescriptor;

export type ReferenceFramePlannerResult =
  | Readonly<{
      kind: 'planned';
      frame: ReferenceFrame;
      payload: ConceptPayload;
      attempts: Readonly<{ frame: number; payload: number }>;
    }>
  | Readonly<{
      kind: 'rejected';
      stage: 'preflight' | 'frame' | 'payload';
      reason: PlannerReasonCode;
      attempts: number;
      terminal: 'preflight' | 'retry_exhausted' | 'non_retryable';
      responseKeys?: readonly string[];
      validationPath?: string;
    }>;
