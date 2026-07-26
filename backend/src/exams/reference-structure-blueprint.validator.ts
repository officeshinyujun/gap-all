import type {
  ContractValidationResult,
  GroundingLexicon,
  ReferenceStructureBlueprint,
  ResponseStructure,
  SemanticAtom,
  SubjectSlot,
} from './reference-frame.types';
import {
  GROUNDING_ENTITY_CLASSES,
  GROUNDING_QUANTITY_UNITS,
  INFORMATION_UNIT_KINDS,
  ITEM_ROLE_KINDS,
  PREDICATE_KINDS,
  QUANTITY_ROLES,
  RELATION_KINDS,
  SEMANTIC_OPERATORS,
  SUBJECT_SLOTS,
} from './reference-frame.types';
import {
  exact,
  invalid,
  isRecord,
  matches,
  text,
  texts,
  valid,
  whole,
} from './reference-frame.validation-utils';

const UNIT_IDENTIFIER = /^unit_[1-9][0-9]*$/;
const ATOM_IDENTIFIER = /^atom_[a-z0-9_]+$/;
const QUANTITY_IDENTIFIER = /^quantity_[a-z0-9_]+$/;
const RULE_IDENTIFIER = /^rule_[a-z0-9_]+$/;
const CONCEPT_IDENTIFIER = /^concept_[a-z0-9_]+$/;

function parseSemanticIdentifierList(
  value: unknown,
  path: string,
  pattern: RegExp,
): ContractValidationResult<readonly string[]> {
  const identifiers = texts(value, 0);
  if (identifiers === null || identifiers.some((id) => !pattern.test(id))) {
    return invalid('INVALID_BLUEPRINT_IDENTIFIER', path);
  }
  return new Set(identifiers).size === identifiers.length
    ? valid(identifiers)
    : invalid('DUPLICATE_BLUEPRINT_IDENTIFIER', path);
}

function parseSubjectSlotList(
  value: unknown,
  path: string,
): ContractValidationResult<readonly SubjectSlot[]> {
  const slots = texts(value, 0);
  if (slots === null || new Set(slots).size !== slots.length) {
    return invalid('INVALID_FIELD_VALUE', path);
  }
  const parsed: SubjectSlot[] = [];
  for (const slot of slots) {
    if (!matches(slot, SUBJECT_SLOTS)) {
      return invalid('INVALID_FIELD_VALUE', path);
    }
    parsed.push(slot);
  }
  return valid(parsed);
}

export function parseSemanticAtoms(
  value: unknown,
): ContractValidationResult<readonly SemanticAtom[]> {
  const path = 'referenceFrame.semanticAtoms';
  if (!Array.isArray(value) || value.length === 0) {
    return invalid('INVALID_STRUCTURE_BLUEPRINT', path);
  }
  const atoms: SemanticAtom[] = [];
  const identifiers = new Set<string>();
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) return invalid('INVALID_OBJECT', itemPath);
    const keyError = exact(
      item,
      [
        'id',
        'subjectSlot',
        'predicateKind',
        'operator',
        'objectSlot',
        'quantityRole',
        'polarity',
      ],
      itemPath,
    );
    if (keyError !== null) return keyError;
    const id = text(item.id);
    const subjectSlot = text(item.subjectSlot);
    const predicateKind = text(item.predicateKind);
    const operator = text(item.operator);
    const objectSlot = item.objectSlot === null ? null : text(item.objectSlot);
    const quantityRole =
      item.quantityRole === null ? null : text(item.quantityRole);
    if (
      id === null ||
      !ATOM_IDENTIFIER.test(id) ||
      identifiers.has(id) ||
      subjectSlot === null ||
      !matches(subjectSlot, SUBJECT_SLOTS) ||
      predicateKind === null ||
      !matches(predicateKind, PREDICATE_KINDS) ||
      operator === null ||
      !matches(operator, SEMANTIC_OPERATORS) ||
      (objectSlot !== null && !matches(objectSlot, SUBJECT_SLOTS)) ||
      (quantityRole !== null && !matches(quantityRole, QUANTITY_ROLES)) ||
      typeof item.polarity !== 'boolean'
    ) {
      return invalid('INVALID_FIELD_VALUE', itemPath);
    }
    identifiers.add(id);
    atoms.push({
      id,
      subjectSlot,
      predicateKind,
      operator,
      objectSlot,
      quantityRole,
      polarity: item.polarity,
    });
  }
  return valid(atoms);
}

export function parseGroundingLexicon(
  value: unknown,
  atoms: readonly SemanticAtom[],
): ContractValidationResult<GroundingLexicon> {
  const path = 'referenceFrame.groundingLexicon';
  if (!isRecord(value)) return invalid('INVALID_OBJECT', path);
  const keyError = exact(
    value,
    ['entities', 'quantities', 'rules', 'bindings'],
    path,
  );
  if (keyError !== null) return keyError;
  if (
    !Array.isArray(value.entities) ||
    !Array.isArray(value.quantities) ||
    !Array.isArray(value.rules) ||
    !Array.isArray(value.bindings)
  ) {
    return invalid('INVALID_FIELD_VALUE', path);
  }

  const entities: GroundingLexicon['entities'][number][] = [];
  const entitySlots = new Set<string>();
  for (const [index, entity] of value.entities.entries()) {
    const entityPath = `${path}.entities[${index}]`;
    if (!isRecord(entity)) return invalid('INVALID_OBJECT', entityPath);
    const entityKeyError = exact(entity, ['slot', 'class'], entityPath);
    if (entityKeyError !== null) return entityKeyError;
    const slot = text(entity.slot);
    const entityClass = text(entity.class);
    if (
      slot === null ||
      !matches(slot, SUBJECT_SLOTS) ||
      entityClass === null ||
      !matches(entityClass, GROUNDING_ENTITY_CLASSES) ||
      entitySlots.has(slot)
    ) {
      return invalid('INVALID_FIELD_VALUE', entityPath);
    }
    entitySlots.add(slot);
    entities.push({ slot, class: entityClass });
  }

  const quantities: GroundingLexicon['quantities'][number][] = [];
  const quantityIds = new Set<string>();
  for (const [index, quantity] of value.quantities.entries()) {
    const quantityPath = `${path}.quantities[${index}]`;
    if (!isRecord(quantity)) return invalid('INVALID_OBJECT', quantityPath);
    const quantityKeyError = exact(
      quantity,
      ['id', 'role', 'value', 'unit'],
      quantityPath,
    );
    if (quantityKeyError !== null) return quantityKeyError;
    const id = text(quantity.id);
    const role = quantity.role === null ? null : text(quantity.role);
    const unit = text(quantity.unit);
    if (
      id === null ||
      !QUANTITY_IDENTIFIER.test(id) ||
      quantityIds.has(id) ||
      (role !== null && !matches(role, QUANTITY_ROLES)) ||
      typeof quantity.value !== 'number' ||
      !Number.isFinite(quantity.value) ||
      unit === null ||
      !matches(unit, GROUNDING_QUANTITY_UNITS)
    ) {
      return invalid('INVALID_FIELD_VALUE', quantityPath);
    }
    quantityIds.add(id);
    quantities.push({ id, role, value: quantity.value, unit });
  }

  const rules: GroundingLexicon['rules'][number][] = [];
  const ruleIds = new Set<string>();
  for (const [index, rule] of value.rules.entries()) {
    const rulePath = `${path}.rules[${index}]`;
    if (!isRecord(rule)) return invalid('INVALID_OBJECT', rulePath);
    const ruleKeyError = exact(rule, ['id', 'conceptId', 'polarity'], rulePath);
    if (ruleKeyError !== null) return ruleKeyError;
    const id = text(rule.id);
    const conceptId = text(rule.conceptId);
    if (
      id === null ||
      !RULE_IDENTIFIER.test(id) ||
      ruleIds.has(id) ||
      conceptId === null ||
      !CONCEPT_IDENTIFIER.test(conceptId) ||
      typeof rule.polarity !== 'boolean'
    ) {
      return invalid('INVALID_FIELD_VALUE', rulePath);
    }
    ruleIds.add(id);
    rules.push({ id, conceptId, polarity: rule.polarity });
  }

  const atomIds = new Set(atoms.map((atom) => atom.id));
  const bindings: GroundingLexicon['bindings'][number][] = [];
  const boundAtomIds = new Set<string>();
  for (const [index, binding] of value.bindings.entries()) {
    const bindingPath = `${path}.bindings[${index}]`;
    if (!isRecord(binding)) return invalid('INVALID_OBJECT', bindingPath);
    const bindingKeyError = exact(
      binding,
      ['atomId', 'entitySlots', 'quantityIds', 'ruleIds'],
      bindingPath,
    );
    if (bindingKeyError !== null) return bindingKeyError;
    const atomId = text(binding.atomId);
    const boundEntitySlots = parseSubjectSlotList(
      binding.entitySlots,
      `${bindingPath}.entitySlots`,
    );
    const boundQuantityIds = parseSemanticIdentifierList(
      binding.quantityIds,
      `${bindingPath}.quantityIds`,
      QUANTITY_IDENTIFIER,
    );
    const boundRuleIds = parseSemanticIdentifierList(
      binding.ruleIds,
      `${bindingPath}.ruleIds`,
      RULE_IDENTIFIER,
    );
    if (
      atomId === null ||
      !atomIds.has(atomId) ||
      boundAtomIds.has(atomId) ||
      !boundEntitySlots.ok ||
      !boundQuantityIds.ok ||
      !boundRuleIds.ok
    ) {
      return invalid('INVALID_FIELD_VALUE', bindingPath);
    }
    boundAtomIds.add(atomId);
    bindings.push({
      atomId,
      entitySlots: boundEntitySlots.value,
      quantityIds: boundQuantityIds.value,
      ruleIds: boundRuleIds.value,
    });
  }

  return valid({ entities, quantities, rules, bindings });
}

export function parseReferenceStructureBlueprint(
  value: unknown,
  response: ResponseStructure,
  atomIds: ReadonlySet<string>,
): ContractValidationResult<ReferenceStructureBlueprint> {
  const path = 'referenceFrame.structureBlueprint';
  if (!isRecord(value)) return invalid('INVALID_STRUCTURE_BLUEPRINT', path);
  const keyError = exact(
    value,
    [
      'informationUnits',
      'relations',
      'reasoningSteps',
      'itemRoles',
      'evidenceBlocks',
    ],
    path,
  );
  if (keyError !== null) return keyError;
  if (
    !Array.isArray(value.informationUnits) ||
    !Array.isArray(value.relations) ||
    !Array.isArray(value.reasoningSteps) ||
    !Array.isArray(value.itemRoles) ||
    !Array.isArray(value.evidenceBlocks)
  ) {
    return invalid('INVALID_STRUCTURE_BLUEPRINT', path);
  }
  if (
    response.choiceTopology === 'combo_sets' &&
    response.viewItemCount === 0
  ) {
    return invalid('INVALID_STRUCTURE_BLUEPRINT', `${path}.itemRoles`);
  }
  if (
    response.choiceTopology === 'combo_sets' &&
    response.viewItemCount > 0 &&
    value.itemRoles.length === 0
  ) {
    return invalid('UNREFERENCED_BLUEPRINT_ROLE', `${path}.itemRoles`);
  }

  const unitIds = new Set<string>();
  let expectedOrder = 1;
  for (const [index, unit] of value.informationUnits.entries()) {
    const unitPath = `${path}.informationUnits[${index}]`;
    if (!isRecord(unit))
      return invalid('INVALID_STRUCTURE_BLUEPRINT', unitPath);
    const unitKeyError = exact(
      unit,
      ['id', 'order', 'kind', 'atomIds'],
      unitPath,
    );
    if (unitKeyError !== null) return unitKeyError;
    const id = text(unit.id);
    const order = whole(unit.order);
    const kind = text(unit.kind);
    const atomList = texts(unit.atomIds, 0);
    if (
      id === null ||
      !UNIT_IDENTIFIER.test(id) ||
      unitIds.has(id) ||
      order === null ||
      order !== expectedOrder ||
      kind === null ||
      !matches(kind, INFORMATION_UNIT_KINDS) ||
      atomList === null ||
      atomList.some((atomId) => !atomIds.has(atomId))
    ) {
      return id === null || !UNIT_IDENTIFIER.test(id)
        ? invalid('INVALID_BLUEPRINT_IDENTIFIER', `${unitPath}.id`)
        : unitIds.has(id)
          ? invalid('DUPLICATE_BLUEPRINT_IDENTIFIER', `${unitPath}.id`)
          : unit.kind === 'prose'
            ? invalid('INVALID_BLUEPRINT_IDENTIFIER', unitPath)
            : order === null || order !== expectedOrder
              ? invalid('MISSING_BLUEPRINT_ORDER', `${unitPath}.order`)
              : invalid('INVALID_STRUCTURE_BLUEPRINT', unitPath);
    }
    unitIds.add(id);
    expectedOrder += 1;
  }

  const relationGraph = new Map<string, Set<string>>();
  const relationPairs = new Set<string>();
  for (const [index, relation] of value.relations.entries()) {
    const relationPath = `${path}.relations[${index}]`;
    if (!isRecord(relation))
      return invalid('INVALID_STRUCTURE_BLUEPRINT', relationPath);
    const relationKeyError = exact(
      relation,
      ['kind', 'fromUnitId', 'toUnitId'],
      relationPath,
    );
    if (relationKeyError !== null) return relationKeyError;
    const kind = text(relation.kind);
    const fromUnitId = text(relation.fromUnitId);
    const toUnitId = text(relation.toUnitId);
    if (
      kind === null ||
      !matches(kind, RELATION_KINDS) ||
      fromUnitId === null ||
      !unitIds.has(fromUnitId) ||
      toUnitId === null ||
      !unitIds.has(toUnitId)
    ) {
      return invalid('INVALID_BLUEPRINT_RELATION', relationPath);
    }
    const pair = `${kind}:${fromUnitId}:${toUnitId}`;
    if (relationPairs.has(pair))
      return invalid('INVALID_BLUEPRINT_RELATION', relationPath);
    relationPairs.add(pair);
    if (kind === 'condition_of') {
      const fromUnit = value.informationUnits.find(
        (unit) => isRecord(unit) && text(unit.id) === fromUnitId,
      );
      const toUnit = value.informationUnits.find(
        (unit) => isRecord(unit) && text(unit.id) === toUnitId,
      );
      if (
        !isRecord(fromUnit) ||
        !isRecord(toUnit) ||
        text(fromUnit.kind) !== 'condition' ||
        text(toUnit.kind) !== 'conclusion'
      ) {
        return invalid('INVALID_BLUEPRINT_RELATION', relationPath);
      }
    }
    const outgoing = relationGraph.get(fromUnitId) ?? new Set<string>();
    outgoing.add(toUnitId);
    relationGraph.set(fromUnitId, outgoing);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (unitId: string): boolean => {
    if (visited.has(unitId)) return false;
    if (visiting.has(unitId)) return true;
    visiting.add(unitId);
    for (const nextUnitId of relationGraph.get(unitId) ?? []) {
      if (hasCycle(nextUnitId)) return true;
    }
    visiting.delete(unitId);
    visited.add(unitId);
    return false;
  };
  for (const unitId of relationGraph.keys()) {
    if (hasCycle(unitId))
      return invalid('CYCLIC_BLUEPRINT_RELATION', `${path}.relations`);
  }

  const roleKeys = new Set<string>();
  const choiceRoleIndexes = new Set<number>();
  for (const [index, itemRole] of value.itemRoles.entries()) {
    const rolePath = `${path}.itemRoles[${index}]`;
    if (!isRecord(itemRole))
      return invalid('INVALID_STRUCTURE_BLUEPRINT', rolePath);
    const roleKeyError = exact(
      itemRole,
      ['itemKind', 'itemIndex', 'role', 'unitIds', 'reasoningStepIds'],
      rolePath,
    );
    if (roleKeyError !== null) return roleKeyError;
    const itemKind = text(itemRole.itemKind);
    const role = text(itemRole.role);
    const itemIndex = whole(itemRole.itemIndex);
    const unitList = texts(itemRole.unitIds, 0);
    const stepList = texts(itemRole.reasoningStepIds, 0);
    const roleKey = `${itemKind}:${itemIndex}:${role}`;
    if (
      itemKind === null ||
      !matches(itemKind, ['choice', 'view_item']) ||
      itemIndex === null ||
      itemIndex < 1 ||
      role === null ||
      !matches(role, ITEM_ROLE_KINDS) ||
      unitList === null ||
      unitList.some((unitId) => !unitIds.has(unitId)) ||
      stepList === null ||
      roleKeys.has(roleKey)
    ) {
      return unitList === null ||
        unitList.some((unitId) => !unitIds.has(unitId))
        ? invalid('UNREFERENCED_BLUEPRINT_ROLE', `${rolePath}.unitIds`)
        : invalid('UNREFERENCED_BLUEPRINT_ROLE', rolePath);
    }
    roleKeys.add(roleKey);
    if (itemKind === 'choice') choiceRoleIndexes.add(itemIndex);
  }

  const requiredChoiceRoleCount =
    response.choiceTopology === 'combo_sets'
      ? response.viewItemCount
      : response.choiceCount;
  for (
    let itemIndex = 1;
    itemIndex <= requiredChoiceRoleCount;
    itemIndex += 1
  ) {
    if (!choiceRoleIndexes.has(itemIndex)) {
      return invalid('UNREFERENCED_BLUEPRINT_ROLE', `${path}.itemRoles`);
    }
  }

  const evidenceBlockKeys = new Set<string>();
  const evidenceBlocksMutable: Array<
    ReferenceStructureBlueprint['evidenceBlocks'][number]
  > = [];
  const expectedEvidenceOrder = value.itemRoles.map(
    (role) => `${role.itemKind}:${role.itemIndex}:${role.role}`,
  );
  for (const [index, evidenceBlock] of value.evidenceBlocks.entries()) {
    const evidenceBlockPath = `${path}.evidenceBlocks[${index}]`;
    if (!isRecord(evidenceBlock))
      return invalid('INVALID_STRUCTURE_BLUEPRINT', evidenceBlockPath);
    const evidenceBlockKeyError = exact(
      evidenceBlock,
      ['itemKind', 'itemIndex', 'role', 'unitIds', 'reasoningStepIds'],
      evidenceBlockPath,
    );
    if (evidenceBlockKeyError !== null) return evidenceBlockKeyError;
    const itemKind = text(evidenceBlock.itemKind);
    const role = text(evidenceBlock.role);
    const itemIndex = whole(evidenceBlock.itemIndex);
    const unitList = texts(evidenceBlock.unitIds, 0);
    const stepList = texts(evidenceBlock.reasoningStepIds, 0);
    const evidenceBlockKey = `${itemKind}:${itemIndex}:${role}`;
    if (
      itemKind === null ||
      !matches(itemKind, ['choice', 'view_item']) ||
      itemIndex === null ||
      itemIndex < 1 ||
      role === null ||
      !matches(role, ITEM_ROLE_KINDS) ||
      unitList === null ||
      unitList.some((unitId) => !unitIds.has(unitId)) ||
      stepList === null ||
      evidenceBlockKeys.has(evidenceBlockKey)
    ) {
      return unitList === null ||
        unitList.some((unitId) => !unitIds.has(unitId))
        ? invalid('UNREFERENCED_BLUEPRINT_ROLE', `${evidenceBlockPath}.unitIds`)
        : invalid('INVALID_STRUCTURE_BLUEPRINT', evidenceBlockPath);
    }
    if (expectedEvidenceOrder[index] !== evidenceBlockKey) {
      return invalid(
        'INVALID_STRUCTURE_BLUEPRINT',
        `${evidenceBlockPath}.order`,
      );
    }
    evidenceBlockKeys.add(evidenceBlockKey);
    evidenceBlocksMutable.push({
      itemKind,
      itemIndex,
      role,
      unitIds: unitList,
      reasoningStepIds: stepList,
    });
  }

  if (evidenceBlocksMutable.length !== value.itemRoles.length) {
    return invalid('INVALID_STRUCTURE_BLUEPRINT', `${path}.evidenceBlocks`);
  }

  return valid({
    informationUnits: value.informationUnits,
    relations: value.relations,
    reasoningSteps: value.reasoningSteps,
    itemRoles: value.itemRoles,
    evidenceBlocks: evidenceBlocksMutable,
  });
}
