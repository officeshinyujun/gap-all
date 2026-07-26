import { isStructuredTplName, type StructuredTplName } from './tpl-schemas';
import {
  type ReferenceChoiceTopology,
  type ReferenceMaterialKind,
  type ReferenceReasoningPattern,
  type ResponseMode,
  type InformationShape,
  validateConceptPayload,
  validateConceptPayloadAgainstArchetype,
} from './reference-frame.types';
import type { ReferenceArchetype } from './reference-archetype';
import { isRecord, text } from './reference-frame.validation-utils';
import { StimulusNormalizer } from './stimulus-normalizer';

export const CANONICAL_TPL_BY_INFORMATION_SHAPE = {
  comparison: 'TPL_COMPARATIVE_MATRIX',
  condition_flow: 'TPL_SEQUENTIAL_WORKFLOW',
  role_dialogue: 'TPL_CONVERSATIONAL_FLOW',
  case_profile: 'TPL_CASE_DIAGNOSTIC_FRAME',
  document_rules: 'TPL_FORMAL_DOCUMENT',
  quantitative_change: 'TPL_QUANTITATIVE_CHART',
  forum_qa: 'TPL_DIGITAL_FORUM_INTERFACE',
  instruction_scene: 'TPL_INSTRUCTIONAL_SCENE',
  public_notice: 'TPL_PROMOTIONAL_CANVAS',
} as const satisfies Readonly<Record<InformationShape, StructuredTplName>>;

export type ReferenceTplSelectionResult =
  | Readonly<{ kind: 'selected'; template: StructuredTplName }>
  | Readonly<{
      kind: 'rejected';
      reason:
        | 'INVALID_CONCEPT_PAYLOAD'
        | 'UNSUPPORTED_TEMPLATE'
        | 'TEMPLATE_MISMATCH'
        | 'INVALID_TEMPLATE_DATA'
        | 'TPL_SELECTION_REJECTED';
    }>;

type SupportedResponseMode = Extract<
  ResponseMode,
  'truth_combination' | 'single_selection'
>;

const ALLOWED_TEMPLATES_BY_ARCHETYPE_MECHANICS = {
  table: {
    truth_combination: ['TPL_COMPARATIVE_MATRIX'],
    single_selection: ['TPL_COMPARATIVE_MATRIX'],
  },
  case: {
    truth_combination: ['TPL_CASE_DIAGNOSTIC_FRAME'],
    single_selection: ['TPL_CASE_DIAGNOSTIC_FRAME'],
  },
  timeline: {
    truth_combination: ['TPL_SEQUENTIAL_WORKFLOW'],
    single_selection: ['TPL_SEQUENTIAL_WORKFLOW'],
  },
  dialogue: {
    truth_combination: ['TPL_CONVERSATIONAL_FLOW'],
    single_selection: ['TPL_CONVERSATIONAL_FLOW'],
  },
  document: {
    truth_combination: [
      'TPL_FORMAL_DOCUMENT',
      'TPL_ANNOUNCEMENT',
      'TPL_REPORT',
    ],
    single_selection: ['TPL_FORMAL_DOCUMENT', 'TPL_ANNOUNCEMENT', 'TPL_REPORT'],
  },
  law_excerpt: {
    truth_combination: ['TPL_FORMAL_DOCUMENT', 'TPL_REPORT'],
    single_selection: ['TPL_FORMAL_DOCUMENT', 'TPL_REPORT'],
  },
  consultation_qna: {
    truth_combination: ['TPL_DIGITAL_FORUM_INTERFACE'],
    single_selection: ['TPL_DIGITAL_FORUM_INTERFACE'],
  },
  incident_report: {
    truth_combination: [
      'TPL_INCIDENT_REPORT',
      'TPL_ARTICLE',
      'TPL_CASE_DIAGNOSTIC_FRAME',
    ],
    single_selection: [
      'TPL_INCIDENT_REPORT',
      'TPL_ARTICLE',
      'TPL_CASE_DIAGNOSTIC_FRAME',
    ],
  },
  checklist: {
    truth_combination: ['TPL_COMPARATIVE_MATRIX'],
    single_selection: ['TPL_COMPARATIVE_MATRIX'],
  },
  investigation_report: {
    truth_combination: [
      'TPL_CASE_DIAGNOSTIC_FRAME',
      'TPL_REPORT',
      'TPL_ARTICLE',
    ],
    single_selection: [
      'TPL_CASE_DIAGNOSTIC_FRAME',
      'TPL_REPORT',
      'TPL_ARTICLE',
    ],
  },
  dashboard: {
    truth_combination: ['TPL_QUANTITATIVE_CHART'],
    single_selection: ['TPL_QUANTITATIVE_CHART'],
  },
  classroom_board: {
    truth_combination: ['TPL_INSTRUCTIONAL_SCENE'],
    single_selection: ['TPL_INSTRUCTIONAL_SCENE'],
  },
  plain: {
    truth_combination: [
      'TPL_ARTICLE',
      'TPL_STATISTICS',
      'TPL_REPORT',
      'TPL_COMPARATIVE_MATRIX',
      'TPL_INCIDENT_REPORT',
      'TPL_ANNOUNCEMENT',
      'TPL_CASE_DIAGNOSTIC_FRAME',
      'TPL_CONVERSATIONAL_FLOW',
    ],
    single_selection: [
      'TPL_ARTICLE',
      'TPL_STATISTICS',
      'TPL_REPORT',
      'TPL_INCIDENT_REPORT',
      'TPL_ANNOUNCEMENT',
      'TPL_CASE_DIAGNOSTIC_FRAME',
      'TPL_CONVERSATIONAL_FLOW',
      'TPL_COMPARATIVE_MATRIX',
    ],
  },
} as const satisfies Readonly<
  Record<
    ReferenceMaterialKind,
    Readonly<Record<SupportedResponseMode, readonly StructuredTplName[]>>
  >
>;

const RESPONSE_TOPOLOGY: Readonly<
  Record<SupportedResponseMode, ReferenceChoiceTopology>
> = {
  truth_combination: 'combo_sets',
  single_selection: 'single_choice',
};

const REASONING_INFORMATION_SHAPE: Readonly<
  Record<ReferenceReasoningPattern, InformationShape>
> = {
  comparison: 'comparison',
  condition_flow: 'condition_flow',
  role_dialogue: 'role_dialogue',
  case_profile: 'case_profile',
  document_rules: 'document_rules',
};

function isSupportedResponseMode(
  mode: ResponseMode,
): mode is SupportedResponseMode {
  return mode === 'truth_combination' || mode === 'single_selection';
}

export function allowedTemplatesForArchetype(
  archetype: ReferenceArchetype,
): readonly StructuredTplName[] {
  if (!isSupportedResponseMode(archetype.responseMode)) return [];
  const reasoningMatchesInformationShape =
    archetype.stimulusRole === 'prose' &&
    archetype.choiceTopology === 'combo_sets'
      ? archetype.informationShape === 'comparison'
      : archetype.informationShape ===
        REASONING_INFORMATION_SHAPE[archetype.reasoningPattern];
  if (
    archetype.shell.kind !== archetype.materialKind ||
    archetype.shell.requiresStructuredSource !==
      (archetype.materialKind !== 'plain') ||
    archetype.shell.requiresViewBlock !== archetype.viewItemCount > 0 ||
    archetype.shell.requiresChoiceCombination !==
      (archetype.choiceTopology === 'combo_sets') ||
    archetype.setStructure.viewItemCount !== archetype.viewItemCount ||
    archetype.choiceTopology !== RESPONSE_TOPOLOGY[archetype.responseMode] ||
    !reasoningMatchesInformationShape
  ) {
    return [];
  }
  return ALLOWED_TEMPLATES_BY_ARCHETYPE_MECHANICS[archetype.materialKind][
    archetype.responseMode
  ];
}

function hasFormalDocumentMetadata(stimulusData: unknown): boolean {
  if (!isRecord(stimulusData) || !isRecord(stimulusData.header_info)) {
    return false;
  }
  return (
    text(stimulusData.header_info.title) !== null &&
    text(stimulusData.header_info.date) !== null &&
    text(stimulusData.header_info.author) !== null
  );
}

export function selectReferenceTpl(
  payload: unknown,
  selectedTemplate: unknown,
  stimulusData: unknown,
  archetype?: ReferenceArchetype,
): ReferenceTplSelectionResult {
  const parsedPayload = validateConceptPayload(payload);
  if (!parsedPayload.ok) {
    return { kind: 'rejected', reason: 'INVALID_CONCEPT_PAYLOAD' };
  }
  if (!isStructuredTplName(selectedTemplate)) {
    return { kind: 'rejected', reason: 'UNSUPPORTED_TEMPLATE' };
  }

  const template =
    CANONICAL_TPL_BY_INFORMATION_SHAPE[
      parsedPayload.value.requiredInformationShape
    ];
  if (archetype !== undefined) {
    const compatiblePayload = validateConceptPayloadAgainstArchetype(
      parsedPayload.value,
      archetype,
    );
    if (!compatiblePayload.ok) {
      return { kind: 'rejected', reason: 'INVALID_CONCEPT_PAYLOAD' };
    }
    const ordinaryCandidates = [template] as const;
    const compatibleCandidates = ordinaryCandidates.filter((candidate) =>
      allowedTemplatesForArchetype(archetype).includes(candidate),
    );
    if (
      compatibleCandidates.length === 0 ||
      !allowedTemplatesForArchetype(archetype).includes(selectedTemplate)
    ) {
      return { kind: 'rejected', reason: 'TPL_SELECTION_REJECTED' };
    }
  }
  if (selectedTemplate !== template) {
    return { kind: 'rejected', reason: 'TEMPLATE_MISMATCH' };
  }
  if (
    template === 'TPL_FORMAL_DOCUMENT' &&
    !hasFormalDocumentMetadata(stimulusData)
  ) {
    return { kind: 'rejected', reason: 'INVALID_TEMPLATE_DATA' };
  }
  if (!new StimulusNormalizer().isRenderableTplData(stimulusData, template)) {
    return { kind: 'rejected', reason: 'INVALID_TEMPLATE_DATA' };
  }

  return { kind: 'selected', template };
}
