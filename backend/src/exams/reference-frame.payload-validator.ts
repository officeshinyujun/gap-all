import {
  CHOICE_ENCODINGS,
  RESPONSE_MODES,
  type AnswerPlan,
  type ConceptPayload,
  type ContractValidationResult,
} from './reference-frame.types';
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
  text,
  texts,
  valid,
  whole,
} from './reference-frame.validation-utils';
import type { ReferenceArchetype } from './reference-archetype';
import { validateConceptPayloadAgainstArchetype } from './reference-frame.payload-archetype-validator';
export { validateConceptPayloadAgainstArchetype } from './reference-frame.payload-archetype-validator';

const CONCEPT_IDENTIFIER = /^concept_[a-z0-9_]+$/;
const OPTION_IDENTIFIER = /^option_[a-z0-9_]+$/;
const ATOM_IDENTIFIER = /^atom_[a-z0-9_]+$/;

const RESPONSE_ENCODING: Readonly<
  Record<(typeof RESPONSE_MODES)[number], (typeof CHOICE_ENCODINGS)[number]>
> = {
  truth_combination: 'truth_combination',
  single_selection: 'single_choice',
  label_matching: 'label_key',
  pair_selection: 'pair_key',
  blank_workflow: 'blank_key',
};

function parseConceptIds(
  value: unknown,
  path: string,
  minimumLength: number,
): ContractValidationResult<readonly string[]> {
  const conceptIds = texts(value, minimumLength);
  if (
    conceptIds === null ||
    conceptIds.some((id) => !CONCEPT_IDENTIFIER.test(id)) ||
    new Set(conceptIds).size !== conceptIds.length
  ) {
    return invalid('INVALID_FIELD_VALUE', path);
  }
  return valid(conceptIds);
}

function parseAnswerPlan(value: unknown): ContractValidationResult<AnswerPlan> {
  const path = 'conceptPayload.answerPlan';
  if (!isRecord(value)) return invalid('INVALID_OBJECT', path);
  const keyError = exact(
    value,
    ['responseMode', 'choiceEncoding', 'expectedAnswerCount', 'options'],
    path,
  );
  if (keyError !== null) return keyError;
  const responseMode = text(value.responseMode);
  const choiceEncoding = text(value.choiceEncoding);
  const expectedAnswerCount = whole(value.expectedAnswerCount);
  if (
    responseMode === null ||
    !matches(responseMode, RESPONSE_MODES) ||
    choiceEncoding === null ||
    !matches(choiceEncoding, CHOICE_ENCODINGS) ||
    RESPONSE_ENCODING[responseMode] !== choiceEncoding ||
    expectedAnswerCount === null ||
    expectedAnswerCount < 1 ||
    !Array.isArray(value.options) ||
    value.options.length !== expectedAnswerCount
  ) {
    return invalid('INVALID_CHOICE_ENCODING', path);
  }
  const options: AnswerPlan['options'][number][] = [];
  const optionIds = new Set<string>();
  for (const [index, option] of value.options.entries()) {
    const optionPath = `${path}.options[${index}]`;
    if (!isRecord(option)) return invalid('INVALID_OBJECT', optionPath);
    const optionKeyError = exact(
      option,
      ['id', 'verdict', 'atomIds'],
      optionPath,
    );
    if (optionKeyError !== null) return optionKeyError;
    const id = text(option.id);
    const atomIds = texts(option.atomIds, 1);
    if (
      id === null ||
      !OPTION_IDENTIFIER.test(id) ||
      optionIds.has(id) ||
      typeof option.verdict !== 'boolean' ||
      atomIds === null ||
      atomIds.some((atomId) => !ATOM_IDENTIFIER.test(atomId)) ||
      new Set(atomIds).size !== atomIds.length
    ) {
      return invalid('INVALID_FIELD_VALUE', `${path}.options`);
    }
    optionIds.add(id);
    options.push({ id, verdict: option.verdict, atomIds });
  }
  return valid({ responseMode, choiceEncoding, expectedAnswerCount, options });
}

export function validateConceptPayload(
  input: unknown,
): ContractValidationResult<ConceptPayload> {
  if (!isRecord(input)) return invalid('INVALID_OBJECT', 'conceptPayload');
  if (!Object.hasOwn(input, 'unitRange')) {
    return invalid('MISSING_UNIT_RANGE', 'conceptPayload.unitRange');
  }
  const keyError = exact(
    input,
    [
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
    'conceptPayload',
  );
  if (keyError !== null) return keyError;
  const source = parseSource(input.source, 'conceptPayload.source');
  const subject = parseSubject(input.subject, 'conceptPayload.subject');
  const unitRange = parseUnitRange(input.unitRange, 'conceptPayload.unitRange');
  const targetConceptIds = parseConceptIds(
    input.targetConceptIds,
    'conceptPayload.targetConceptIds',
    1,
  );
  const supportingConceptIds = parseConceptIds(
    input.supportingConceptIds,
    'conceptPayload.supportingConceptIds',
    0,
  );
  const distractorAxes = texts(input.distractorAxes, 1);
  const answerPlan = parseAnswerPlan(input.answerPlan);
  const requiredInformationShape = parseInformationShape(
    input.requiredInformationShape,
    'conceptPayload.requiredInformationShape',
  );
  const noveltyRules = texts(input.noveltyRules, 1);
  if (!source.ok) return source;
  if (!subject.ok) return subject;
  if (!unitRange.ok) return unitRange;
  if (!targetConceptIds.ok) return targetConceptIds;
  if (!supportingConceptIds.ok) return supportingConceptIds;
  if (distractorAxes === null) {
    return invalid('EMPTY_DISTRACTOR_AXES', 'conceptPayload.distractorAxes');
  }
  if (!answerPlan.ok) return answerPlan;
  if (!requiredInformationShape.ok) return requiredInformationShape;
  if (noveltyRules === null)
    return invalid('INVALID_FIELD_VALUE', 'conceptPayload');
  if (!Array.isArray(input.eligibleUnits) || input.eligibleUnits.length === 0) {
    return invalid('INVALID_UNIT_RANGE', 'conceptPayload.eligibleUnits');
  }
  const eligibleUnits: number[] = [];
  for (const unit of input.eligibleUnits) {
    const parsed = whole(unit);
    if (
      parsed === null ||
      parsed < unitRange.value.start ||
      parsed > unitRange.value.end ||
      eligibleUnits.includes(parsed)
    ) {
      return invalid('INVALID_UNIT_RANGE', 'conceptPayload.eligibleUnits');
    }
    eligibleUnits.push(parsed);
  }
  return valid({
    source: source.value,
    subject: subject.value,
    unitRange: unitRange.value,
    eligibleUnits,
    targetConceptIds: targetConceptIds.value,
    supportingConceptIds: supportingConceptIds.value,
    distractorAxes,
    answerPlan: answerPlan.value,
    requiredInformationShape: requiredInformationShape.value,
    noveltyRules,
  });
}

export function validateConceptPayloadJson(
  json: string,
  archetype?: ReferenceArchetype,
): ContractValidationResult<ConceptPayload> {
  const parsed = parseJson(json, 'conceptPayload', validateConceptPayload);
  return archetype === undefined || !parsed.ok
    ? parsed
    : validateConceptPayloadAgainstArchetype(parsed.value, archetype);
}
