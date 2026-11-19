import type { ReferenceFrame } from './reference-frame.types';
import { invariantPromptRequirementsFor } from './reference-contract-invariants';
import type {
  PlannerReasonCode,
  ReferenceFramePlannerRequest,
} from './reference-frame-planner.types';

function selectedReferenceArchetype(request: ReferenceFramePlannerRequest) {
  return request.archetype;
}

export function buildReferenceFramePrompt(
  request: ReferenceFramePlannerRequest,
  correction?: PlannerReasonCode,
): string {
  return JSON.stringify({
    task: 'Extract only the structural ReferenceFrame from the reference item.',
    response:
      'Return one raw JSON object that satisfies the ReferenceFrame contract exactly.',
    requiredSource: request.reference.source,
    requiredSubject: request.subject,
    requiredUnitRange: request.unitRange,
    requiredArchetype: request.archetype,
    allowedCatalogConcepts: request.catalogConcepts.map(({ id, canonicalLabel }) => ({
      id,
      canonicalLabel,
    })),
    contractRequirements: invariantPromptRequirementsFor('frame'),
    semanticContract: {
      semanticAtoms:
        'Use unique atom_* ids. Each predicateKind/operator/objectSlot/quantityRole combination must be semantically compatible. A conditional operator is allowed only for conditional-capable predicates.',
      groundingLexicon:
        'Create exactly one binding for every semantic atom. Every binding atomId must exist. entitySlots must contain the atom subjectSlot and its objectSlot when present; quantityIds and ruleIds must exist and match the atom quantityRole. Every rule conceptId must be one of allowedCatalogConcepts IDs. Do not duplicate entity slots, quantity ids, rule ids, or bindings.',
      structureBlueprint:
        'Relations must reference declared information units, point from a lower order unit to a higher order unit, and form an acyclic graph. Do not add reciprocal or circular relations.',
    },
    reference: request.reference,
    correction:
      correction === undefined
        ? undefined
        : {
            previousValidationFailure: correction,
            instruction:
              'Discard the previous candidate. Rebuild semantic atoms and grounding bindings with valid references and full coverage, using only allowedCatalogConcepts IDs for rule conceptId. Every relation must name two declared information units, point from a lower order to a higher order, and remain acyclic with no reciprocal edge. Emit an empty relations array instead of an invalid relation.',
          },
  });
}

export function buildConceptPayloadPrompt(
  request: ReferenceFramePlannerRequest,
  frame: ReferenceFrame,
  correction?: PlannerReasonCode,
): string {
  const archetype = selectedReferenceArchetype(request);
  return JSON.stringify({
    task: 'Plan concepts and evidence while preserving the source target concepts, decision rule, reasoning procedure, and response topology.',
    response:
      'Return one raw JSON object that satisfies the ConceptPayload contract exactly.',
    requiredSource: request.reference.source,
    requiredSubject: request.subject,
    requiredUnitRange: request.unitRange,
    requiredFrame: frame,
    requiredArchetype: archetype,
    contractRequirements: invariantPromptRequirementsFor('payload'),
      slotConstraints: {
        exactTargetConceptCount: 1,
        minSupportingConceptCount:
          archetype.conceptRoleCardinality.supporting > 0 ? 1 : 0,
        maxSupportingConceptCount:
          archetype.conceptRoleCardinality.supporting,
        conceptIdsMustBeUnique: true,
      exactClaimCount:
        frame.response.mode === 'truth_combination'
          ? frame.response.viewItemCount
          : undefined,
      preserveResponseMode: frame.response.mode,
      preserveChoiceEncoding: frame.response.choiceEncoding,
    },
    allowedConcepts: request.selection.concepts.map(({ concept }) => concept),
    requiredSourceTargetConceptId: request.requiredSourceTargetConceptId,
    allowedSupportingConceptIds:
      request.requiredSourceConceptIds === undefined
        ? undefined
        : request.requiredSourceConceptIds.filter(
            (conceptId) => conceptId !== request.requiredSourceTargetConceptId,
          ),
    allowedDistractorAxes: request.selection.distractorAxisCatalog,
    referenceConceptsToPreserve: request.reference.targetConcepts,
    referenceDistractorAxesToPreserve: request.referenceDistractorAxes,
    correction:
      correction === undefined
        ? undefined
        : {
            previousValidationFailure: correction,
            instruction:
              correction === 'INVALID_UNIT_RANGE'
                ? `Discard the previous candidate. eligibleUnits must contain only integer units from ${frame.unitRange.start} through ${frame.unitRange.end}. Use exactly one target concept, at most two supporting concepts, and only allowedConcepts.`
                : `Discard the previous candidate. Use exactly one target concept and between ${archetype.conceptRoleCardinality.supporting > 0 ? 1 : 0} and ${archetype.conceptRoleCardinality.supporting} supporting concepts from allowedConcepts. Every concept ID must be unique and supporting concepts must differ from the target concept. Preserve the required archetype response mode, choice encoding, and exact claim cardinality.`,
          },
  });
}
