import { CANONICAL_TPL_BY_INFORMATION_SHAPE } from './reference-tpl-selector';
import type {
  ChoiceEncoding,
  InformationShape,
  ReferenceChoiceTopology,
  CombinationPlan,
  ReferenceDocumentShell,
  ReferenceMaterialKind,
  OptionalSetStructure,
  ReferenceConceptRoleCardinality,
  ReferenceReasoningPattern,
  ResponseMode,
  StemPolarity,
} from './reference-frame.types';
import type { StructuredTplName } from './tpl-schemas';

export const REFERENCE_ARCHETYPE_VERSION = 3 as const;

export type ReferenceStimulusRole =
  'table' | 'dialogue' | 'document' | 'case' | 'timeline' | 'prose';

export type ReferenceArchetype = Readonly<{
  version: typeof REFERENCE_ARCHETYPE_VERSION;
  stemIntent:
    | 'truth_combination'
    | 'positive_single_selection'
    | 'negative_single_selection';
  polarity: StemPolarity;
  responseMode: ResponseMode;
  choiceEncoding: ChoiceEncoding;
  choiceTopology: ReferenceChoiceTopology;
  materialKind: ReferenceMaterialKind;
  reasoningPattern: ReferenceReasoningPattern;
  informationShape: InformationShape;
  sourceTemplate: StructuredTplName;
  stimulusRole: ReferenceStimulusRole;
  shell: ReferenceDocumentShell;
  combinationPlan: CombinationPlan;
  conceptRoleCardinality: ReferenceConceptRoleCardinality;
  setStructure: OptionalSetStructure;
  viewKeys: readonly string[];
  viewItemCount: number;
  choiceCount: 5;
  fingerprint: string;
}>;

export type ReferenceArchetypeSource = Readonly<{
  stem: string;
  stimulus: string;
  viewItems: readonly string[];
  choices: readonly string[];
  targetConcepts?: readonly string[];
}>;

export type ReferenceArchetypeResult =
  | Readonly<{ kind: 'classified'; value: ReferenceArchetype }>
  | Readonly<{
      kind: 'ambiguous';
      reason:
        | 'LETTER_CHOICES_WITHOUT_VIEW'
        | 'NON_COMBINATION_CHOICES_WITH_VIEW'
        | 'UNSUPPORTED_VIEW_KEYS'
        | 'INVALID_DOCUMENT_SHELL';
    }>;

const NEGATIVE_STEM_PATTERN = /옳지\s*않은|적절하지\s*않은|틀린\s*것|아닌\s*것/;
const LETTER_KEY_PATTERN = /[ㄱ-ㅎ]/;
const COMBINATION_CHOICE_PATTERN =
  /^\s*[①②③④⑤]\s*(?:[ㄱ-ㅎ](?:\s*,\s*[ㄱ-ㅎ])*(?:\s*모두\s*아님)?|해당\s*없음|모두\s*옳다|없음)\s*$/;

function viewKeys(viewItems: readonly string[]): readonly string[] | null {
  const keys = viewItems.map((item) => item.match(/^\s*([ㄱ-ㅎ])\./)?.[1]);
  if (keys.some((key) => key === undefined)) return null;
  const normalized = keys.filter((key): key is string => key !== undefined);
  return new Set(normalized).size === normalized.length ? normalized : null;
}

export function isReferenceCombinationChoiceSet(
  choices: readonly string[],
): boolean {
  return choices.every((choice) => COMBINATION_CHOICE_PATTERN.test(choice));
}

function hasLetterChoices(choices: readonly string[]): boolean {
  return choices.some((choice) => LETTER_KEY_PATTERN.test(choice));
}

const DIALOGUE_TURN_PATTERN = /^\s*[^\n]{1,24}:\s/m;
const DATE_PREFIX_PATTERN = /^\s*\d{1,2}월\s*\d{1,2}일/;

function stimulusRole(stimulus: string): ReferenceStimulusRole {
  if (/\|.+\|/.test(stimulus)) return 'table';
  if (stimulus.includes('\n') && DIALOGUE_TURN_PATTERN.test(stimulus)) {
    const turns = stimulus
      .split('\n')
      .filter(
        (line) =>
          DIALOGUE_TURN_PATTERN.test(line) && !DATE_PREFIX_PATTERN.test(line),
      ).length;
    if (turns >= 2) return 'dialogue';
  }
  const bracketedTurns = stimulus
    .split('\n')
    .filter((line) => /^\s*\[[^\]\n]{1,24}\]\s+\S/.test(line)).length;
  if (bracketedTurns >= 2) return 'dialogue';
  if (/[A-Z가-힣]씨|사례|학생\s*[A-Z]/.test(stimulus)) return 'case';
  const bracketed = stimulus.match(/\[([^\]]+)\]/);
  if (bracketed && !/^\d+[~〜-]\d+$/.test(bracketed[1])) {
    const c = bracketed[1];
    if (c.length >= 5) return 'document';
    if (c.length >= 2 && /서$|공고|칼럼|법$|계약|증명|규정|매뉴얼|문서/.test(c))
      return 'document';
  }
  if (/\d{1,2}월\s*\d{1,2}일|과정|순서/.test(stimulus)) return 'timeline';
  return 'prose';
}

function materialKindForRole(
  role: ReferenceStimulusRole,
): ReferenceMaterialKind {
  switch (role) {
    case 'table':
      return 'table';
    case 'dialogue':
      return 'dialogue';
    case 'document':
      return 'document';
    case 'timeline':
      return 'timeline';
    case 'case':
      return 'case';
    case 'prose':
      return 'plain';
  }
}

function reasoningPatternForRole(
  role: ReferenceStimulusRole,
): ReferenceReasoningPattern {
  switch (role) {
    case 'table':
      return 'comparison';
    case 'dialogue':
      return 'role_dialogue';
    case 'document':
      return 'document_rules';
    case 'timeline':
      return 'condition_flow';
    case 'case':
    case 'prose':
      return 'case_profile';
  }
}

function informationShapeForRole(
  role: ReferenceStimulusRole,
  stemIntent: ReferenceArchetype['stemIntent'],
): InformationShape {
  if (stemIntent === 'truth_combination' && role === 'prose') {
    return 'comparison';
  }
  switch (role) {
    case 'table':
      return 'comparison';
    case 'dialogue':
      return 'role_dialogue';
    case 'document':
      return 'document_rules';
    case 'timeline':
      return 'condition_flow';
    case 'case':
    case 'prose':
      return 'case_profile';
  }
}

function fingerprint(
  stemIntent: ReferenceArchetype['stemIntent'],
  responseMode: ResponseMode,
  choiceTopology: ReferenceChoiceTopology,
  informationShape: InformationShape,
  viewKeys: readonly string[],
): string {
  return [
    REFERENCE_ARCHETYPE_VERSION,
    stemIntent,
    responseMode,
    choiceTopology,
    informationShape,
    viewKeys.join(','),
  ].join(':');
}

function setStructureForSource(
  source: ReferenceArchetypeSource,
  viewItemCount: number,
): OptionalSetStructure {
  if (/\[\s*\d+\s*[~〜-]\s*\d+\s*\]/.test(source.stimulus)) {
    return {
      required: true,
      position: 'shared_primary',
      viewItemCount,
    };
  }
  if (
    source.stimulus.trim() === '' &&
    /위\s*(?:보고서|자료|문서)/.test(source.stem)
  ) {
    return { required: true, position: 'shared_pair', viewItemCount };
  }
  return { required: false, position: 'standalone', viewItemCount };
}

function classified(
  source: ReferenceArchetypeSource,
  stemIntent: ReferenceArchetype['stemIntent'],
  responseMode: ResponseMode,
  choiceEncoding: ChoiceEncoding,
  choiceTopology: ReferenceChoiceTopology,
  keys: readonly string[],
): ReferenceArchetype {
  const role = stimulusRole(source.stimulus);
  const materialKind = materialKindForRole(role);
  const reasoningPattern = reasoningPatternForRole(role);
  const informationShape = informationShapeForRole(role, stemIntent);
  const shell: ReferenceDocumentShell = {
    kind: materialKind,
    requiresViewBlock: keys.length > 0,
    requiresChoiceCombination: choiceTopology === 'combo_sets',
    requiresStructuredSource: materialKind !== 'plain',
  };
  const supportingConceptCount = Math.max(
    (source.targetConcepts?.length ?? 1) - 1,
    0,
  );
  return {
    version: REFERENCE_ARCHETYPE_VERSION,
    stemIntent,
    polarity:
      stemIntent === 'negative_single_selection' ? 'negative' : 'positive',
    responseMode,
    choiceEncoding,
    choiceTopology,
    materialKind,
    reasoningPattern,
    informationShape,
    sourceTemplate: CANONICAL_TPL_BY_INFORMATION_SHAPE[informationShape],
    stimulusRole: role,
    shell,
    combinationPlan: {
      expectedAnswerCount: choiceTopology === 'combo_sets' ? keys.length : 1,
      optionCount: source.choices.length,
      topology: choiceTopology,
    },
    conceptRoleCardinality: {
      target: 1,
      supporting: supportingConceptCount,
    },
    setStructure: setStructureForSource(source, keys.length),
    viewKeys: keys,
    viewItemCount: keys.length,
    choiceCount: 5,
    fingerprint: fingerprint(
      stemIntent,
      responseMode,
      choiceTopology,
      informationShape,
      keys,
    ),
  };
}

export function classifyReferenceArchetype(
  source: ReferenceArchetypeSource,
): ReferenceArchetypeResult {
  if (source.viewItems.length > 0) {
    const keys = viewKeys(source.viewItems);
    if (keys === null) {
      return { kind: 'ambiguous', reason: 'UNSUPPORTED_VIEW_KEYS' };
    }
    if (!isReferenceCombinationChoiceSet(source.choices)) {
      return { kind: 'ambiguous', reason: 'NON_COMBINATION_CHOICES_WITH_VIEW' };
    }
    return {
      kind: 'classified',
      value: classified(
        source,
        'truth_combination',
        'truth_combination',
        'truth_combination',
        'combo_sets',
        keys,
      ),
    };
  }

  if (hasLetterChoices(source.choices)) {
    return { kind: 'ambiguous', reason: 'LETTER_CHOICES_WITHOUT_VIEW' };
  }
  const stemIntent = NEGATIVE_STEM_PATTERN.test(source.stem)
    ? 'negative_single_selection'
    : 'positive_single_selection';
  return {
    kind: 'classified',
    value: classified(
      source,
      stemIntent,
      'single_selection',
      'single_choice',
      'single_choice',
      [],
    ),
  };
}
