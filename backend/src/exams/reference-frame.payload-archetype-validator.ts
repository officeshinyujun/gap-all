import type { ReferenceArchetype } from './reference-archetype';
import type {
  ConceptPayload,
  ContractValidationResult,
} from './reference-frame.types';
import { invalid, valid } from './reference-frame.validation-utils';

export function validateConceptPayloadAgainstArchetype(
  payload: ConceptPayload,
  archetype: ReferenceArchetype,
): ContractValidationResult<ConceptPayload> {
  if (payload.requiredInformationShape !== archetype.informationShape) {
    return invalid(
      'PAYLOAD_ARCHETYPE_MISMATCH',
      'conceptPayload.requiredInformationShape',
    );
  }
  if (
    payload.answerPlan.responseMode !== archetype.responseMode ||
    payload.answerPlan.choiceEncoding !== archetype.choiceEncoding
  ) {
    return invalid('PAYLOAD_ARCHETYPE_MISMATCH', 'conceptPayload.answerPlan');
  }
  if (
    archetype.shell.requiresViewBlock !== archetype.viewItemCount > 0 ||
    archetype.setStructure.viewItemCount !== archetype.viewItemCount
  ) {
    return invalid(
      'PAYLOAD_EVIDENCE_BLOCK_MISMATCH',
      'conceptPayload.answerPlan',
    );
  }

  const expectedAnswerCount =
    archetype.choiceTopology === 'combo_sets'
      ? archetype.viewItemCount
      : archetype.choiceCount;
  if (
    payload.answerPlan.expectedAnswerCount !== expectedAnswerCount ||
    payload.answerPlan.options.length !== expectedAnswerCount ||
    (archetype.choiceTopology === 'combo_sets' &&
      archetype.combinationPlan.expectedAnswerCount !== expectedAnswerCount) ||
    archetype.combinationPlan.optionCount !== archetype.choiceCount ||
    archetype.combinationPlan.topology !== archetype.choiceTopology
  ) {
    return invalid(
      'PAYLOAD_COMBINATION_PLAN_MISMATCH',
      'conceptPayload.answerPlan',
    );
  }
  if (
    payload.targetConceptIds.length !==
      archetype.conceptRoleCardinality.target ||
    payload.supportingConceptIds.length <
      (archetype.conceptRoleCardinality.supporting > 0 ? 1 : 0) ||
    payload.supportingConceptIds.length >
      archetype.conceptRoleCardinality.supporting ||
    new Set([...payload.targetConceptIds, ...payload.supportingConceptIds])
      .size !==
      payload.targetConceptIds.length + payload.supportingConceptIds.length
  ) {
    return invalid(
      'PAYLOAD_CONCEPT_ROLE_MISMATCH',
      'conceptPayload.targetConceptIds',
    );
  }
  return valid(payload);
}
