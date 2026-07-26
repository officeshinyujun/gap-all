import {
  CHOICE_ENCODINGS,
  RESPONSE_MODES,
  type ChoiceEncoding,
  type ContractValidationResult,
  type MaterialDensity,
  type ReferenceFrame,
  type ReferenceChoiceTopology,
  type ReferenceDocumentShell,
  type ResponseMode,
  type ResponseStructure,
  type StemStructure,
} from './reference-frame.types';
import {
  parseGroundingLexicon,
  parseReferenceStructureBlueprint,
  parseSemanticAtoms,
} from './reference-structure-blueprint.validator';
import {
  exact,
  invalid,
  isRecord,
  matches,
  parseInformationShape,
  parseJson,
  parseSource,
  parseSubject,
  parseUnitRange,
  texts,
  text,
  valid,
  whole,
} from './reference-frame.validation-utils';
import type { ReferenceArchetype } from './reference-archetype';

const RESPONSE_ENCODING: Readonly<Record<ResponseMode, ChoiceEncoding>> = {
  truth_combination: 'truth_combination',
  single_selection: 'single_choice',
  label_matching: 'label_key',
  pair_selection: 'pair_key',
  blank_workflow: 'blank_key',
};

const RESPONSE_TOPOLOGY: Readonly<
  Record<ResponseMode, ReferenceChoiceTopology>
> = {
  truth_combination: 'combo_sets',
  single_selection: 'single_choice',
  label_matching: 'label_key',
  pair_selection: 'pair_key',
  blank_workflow: 'blank_key',
};

const VALIDATION_FALLBACK_ARCHETYPE = {
  version: 3,
  stemIntent: 'positive_single_selection',
  polarity: 'positive',
  responseMode: 'single_selection',
  choiceEncoding: 'single_choice',
  choiceTopology: 'single_choice',
  materialKind: 'plain',
  reasoningPattern: 'comparison',
  informationShape: 'comparison',
  sourceTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
  stimulusRole: 'prose',
  shell: {
    kind: 'plain',
    requiresStructuredSource: false,
    requiresViewBlock: false,
    requiresChoiceCombination: false,
  },
  combinationPlan: {
    expectedAnswerCount: 1,
    optionCount: 5,
    topology: 'single_choice',
  },
  conceptRoleCardinality: { target: 1, supporting: 0 },
  setStructure: {
    required: false,
    position: 'standalone',
    viewItemCount: 0,
  },
  viewKeys: [],
  viewItemCount: 0,
  choiceCount: 5,
  fingerprint: 'validation-fallback',
} as const satisfies ReferenceArchetype;

function parseStem(value: unknown): ContractValidationResult<StemStructure> {
  if (!isRecord(value)) return invalid('INVALID_OBJECT', 'stem');
  const keyError = exact(
    value,
    ['style', 'polarity', 'languageSignals'],
    'stem',
  );
  if (keyError !== null) return keyError;
  const style = text(value.style);
  const languageSignals = texts(value.languageSignals, 1);
  if (style === null || languageSignals === null) {
    return invalid('INVALID_FIELD_VALUE', 'stem');
  }
  return value.polarity === 'positive' || value.polarity === 'negative'
    ? valid({ style, polarity: value.polarity, languageSignals })
    : invalid('INVALID_FIELD_VALUE', 'stem.polarity');
}

function parseResponse(
  value: unknown,
  archetype: ReferenceArchetype,
): ContractValidationResult<ResponseStructure> {
  if (!isRecord(value)) return invalid('INVALID_OBJECT', 'response');
  const mode = text(value.mode);
  const choiceEncoding = text(value.choiceEncoding);
  if (mode === null || !matches(mode, RESPONSE_MODES)) {
    return invalid('UNSUPPORTED_RESPONSE_MODE', 'response.mode');
  }
  if (
    choiceEncoding === null ||
    !matches(choiceEncoding, CHOICE_ENCODINGS) ||
    RESPONSE_ENCODING[mode] !== choiceEncoding
  ) {
    return invalid('INVALID_CHOICE_ENCODING', 'response.choiceEncoding');
  }
  const keyError = exact(
    value,
    [
      'mode',
      'choiceEncoding',
      'choiceCount',
      'viewItemCount',
      'choiceTopology',
      'combinationPlan',
    ],
    'response',
  );
  if (keyError !== null) return keyError;

  const choiceTopology = text(value.choiceTopology);
  if (choiceTopology !== RESPONSE_TOPOLOGY[mode]) {
    return invalid('INVALID_FIELD_VALUE', 'response.choiceTopology');
  }

  const choiceCount = whole(value.choiceCount);
  const viewItemCount = whole(value.viewItemCount);
  const combinationPlan = isRecord(value.combinationPlan)
    ? value.combinationPlan
    : null;
  const combinationPlanCount =
    combinationPlan === null
      ? null
      : whole(combinationPlan.expectedAnswerCount);
  const combinationPlanOptions =
    combinationPlan === null ? null : whole(combinationPlan.optionCount);
  const combinationPlanTopology =
    combinationPlan === null ? null : text(combinationPlan.topology);
  return choiceCount !== 5 ||
    viewItemCount === null ||
    viewItemCount < 0 ||
    combinationPlan === null ||
    combinationPlanCount !== archetype.combinationPlan.expectedAnswerCount ||
    combinationPlanOptions !== archetype.combinationPlan.optionCount ||
    combinationPlanTopology !== choiceTopology
    ? invalid('INVALID_FIELD_VALUE', 'response')
    : valid({
        mode,
        choiceEncoding,
        choiceCount,
        viewItemCount,
        choiceTopology,
        combinationPlan: {
          expectedAnswerCount: combinationPlanCount,
          optionCount: combinationPlanOptions,
          topology: combinationPlanTopology,
        },
      });
}

function parseMaterialDensity(
  value: unknown,
): ContractValidationResult<MaterialDensity> {
  if (!isRecord(value)) return invalid('INVALID_OBJECT', 'materialDensity');
  const keyError = exact(
    value,
    [
      'targetLength',
      'paragraphCount',
      'namedEntities',
      'numericFacts',
      'conditionCount',
    ],
    'materialDensity',
  );
  if (keyError !== null) return keyError;
  const targetLength = whole(value.targetLength);
  const paragraphCount = whole(value.paragraphCount);
  const namedEntities = whole(value.namedEntities);
  const numericFacts = whole(value.numericFacts);
  const conditionCount = whole(value.conditionCount);
  if (
    targetLength === null ||
    paragraphCount === null ||
    namedEntities === null ||
    numericFacts === null ||
    conditionCount === null ||
    targetLength < 1 ||
    paragraphCount < 0 ||
    namedEntities < 0 ||
    numericFacts < 0 ||
    conditionCount < 0
  ) {
    return invalid('INVALID_FIELD_VALUE', 'materialDensity');
  }
  return valid({
    targetLength,
    paragraphCount,
    namedEntities,
    numericFacts,
    conditionCount,
  });
}

function parseShell(
  value: unknown,
): ContractValidationResult<ReferenceDocumentShell> {
  if (!isRecord(value))
    return invalid('INVALID_OBJECT', 'referenceFrame.shell');
  const keyError = exact(
    value,
    [
      'kind',
      'requiresViewBlock',
      'requiresChoiceCombination',
      'requiresStructuredSource',
    ],
    'referenceFrame.shell',
  );
  if (keyError !== null) return keyError;
  const kind = text(value.kind);
  if (
    kind === null ||
    !matches(kind, [
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
    ]) ||
    typeof value.requiresViewBlock !== 'boolean' ||
    typeof value.requiresChoiceCombination !== 'boolean' ||
    typeof value.requiresStructuredSource !== 'boolean'
  ) {
    return invalid('INVALID_FIELD_VALUE', 'referenceFrame.shell');
  }
  return valid({
    kind,
    requiresViewBlock: value.requiresViewBlock,
    requiresChoiceCombination: value.requiresChoiceCombination,
    requiresStructuredSource: value.requiresStructuredSource,
  });
}

export function validateReferenceFrame(
  input: unknown,
  archetype: ReferenceArchetype = VALIDATION_FALLBACK_ARCHETYPE,
): ContractValidationResult<ReferenceFrame> {
  if (!isRecord(input)) return invalid('INVALID_OBJECT', 'referenceFrame');
  if (!Object.hasOwn(input, 'unitRange')) {
    return invalid('MISSING_UNIT_RANGE', 'referenceFrame.unitRange');
  }

  const keyError = exact(
    input,
    [
      'source',
      'subject',
      'unitRange',
      'stem',
      'response',
      'materialDensity',
      'informationShape',
      'difficultySignals',
      'structureBlueprint',
      'semanticAtoms',
      'groundingLexicon',
      'shell',
    ],
    'referenceFrame',
  );
  if (keyError !== null) return keyError;

  const source = parseSource(input.source, 'referenceFrame.source');
  const subject = parseSubject(input.subject, 'referenceFrame.subject');
  const unitRange = parseUnitRange(input.unitRange, 'referenceFrame.unitRange');
  const stem = parseStem(input.stem);
  const response = parseResponse(input.response, archetype);
  const materialDensity = parseMaterialDensity(input.materialDensity);
  const informationShape = parseInformationShape(
    input.informationShape,
    'referenceFrame.informationShape',
  );
  const difficultySignals = texts(input.difficultySignals, 1);
  const semanticAtoms = parseSemanticAtoms(input.semanticAtoms);
  const shell = parseShell(input.shell);

  if (!source.ok) return source;
  if (!subject.ok) return subject;
  if (!unitRange.ok) return unitRange;
  if (!stem.ok) return stem;
  if (!response.ok) return response;
  if (!materialDensity.ok) return materialDensity;
  if (!informationShape.ok) return informationShape;
  if (difficultySignals === null) {
    return invalid('INVALID_FIELD_VALUE', 'referenceFrame.difficultySignals');
  }
  if (!semanticAtoms.ok) return semanticAtoms;
  if (!shell.ok) return shell;
  const structureBlueprint = parseReferenceStructureBlueprint(
    input.structureBlueprint,
    response.value,
    new Set(semanticAtoms.value.map((atom) => atom.id)),
  );
  if (!structureBlueprint.ok) return structureBlueprint;
  const groundingLexicon = parseGroundingLexicon(
    input.groundingLexicon,
    semanticAtoms.value,
  );
  if (!groundingLexicon.ok) return groundingLexicon;
  if (shell.value.requiresViewBlock !== response.value.viewItemCount > 0) {
    return invalid('INVALID_STRUCTURE_BLUEPRINT', 'referenceFrame.shell');
  }
  if (
    shell.value.requiresChoiceCombination !==
    (response.value.choiceTopology === 'combo_sets')
  ) {
    return invalid('INVALID_CHOICE_ENCODING', 'referenceFrame.shell');
  }
  if (shell.value.requiresStructuredSource !== (shell.value.kind !== 'plain')) {
    return invalid(
      'INVALID_FIELD_VALUE',
      'referenceFrame.shell.requiresStructuredSource',
    );
  }

  return valid({
    source: source.value,
    subject: subject.value,
    unitRange: unitRange.value,
    archetype,
    stem: stem.value,
    response: response.value,
    shell: shell.value,
    materialDensity: materialDensity.value,
    informationShape: informationShape.value,
    difficultySignals,
    structureBlueprint: structureBlueprint.value,
    semanticAtoms: semanticAtoms.value,
    groundingLexicon: groundingLexicon.value,
  });
}

export function validateReferenceFrameJson(
  json: string,
  archetype: ReferenceArchetype = VALIDATION_FALLBACK_ARCHETYPE,
): ContractValidationResult<ReferenceFrame> {
  return parseJson(json, 'referenceFrame', (input) =>
    validateReferenceFrame(input, archetype),
  );
}
