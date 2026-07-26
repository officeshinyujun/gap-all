export const CONVERSATION_ICON_KEYS = [
  'person',
  'student',
  'teacher',
  'citizen',
  'employee',
  'employer',
  'customer',
  'public_official',
  'expert',
  'organization',
  'group',
  'hospital',
  'court',
] as const;

export const CONVERSATION_SCENE_KINDS = [
  'none',
  'dialogue',
  'interview',
  'school',
  'office',
  'public_service',
  'hospital',
  'shop',
  'court',
] as const;

export const CONVERSATION_ACTION_KEYS = [
  'request',
  'inform',
  'consult',
  'approve',
  'reject',
  'provide',
  'report',
  'notify',
  'pay',
  'regulate',
] as const;

export type ConversationIconKey = (typeof CONVERSATION_ICON_KEYS)[number];
export type ConversationSceneKind = (typeof CONVERSATION_SCENE_KINDS)[number];
export type ConversationActionKey = (typeof CONVERSATION_ACTION_KEYS)[number];

export type ConversationVisualRelation = Readonly<{
  from_id: string;
  to_id: string;
  action_key: ConversationActionKey;
  evidence_message_indexes: readonly number[];
}>;

export type ConversationVisualAid = Readonly<{
  kind: 'none' | 'actor_flow';
  actor_ids: readonly string[];
  relations: readonly ConversationVisualRelation[];
}>;

export type ConversationVisualMetadata = Readonly<{
  scene_kind: ConversationSceneKind;
  visual_aid: ConversationVisualAid;
}>;

export type ConversationParticipantIdentity = Readonly<{ id: string }>;
export type ConversationMessageIdentity = Readonly<{ p_id: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function isConversationIconKey(
  value: unknown,
): value is ConversationIconKey {
  return (
    typeof value === 'string' &&
    CONVERSATION_ICON_KEYS.includes(value as ConversationIconKey)
  );
}

export function isConversationSceneKind(
  value: unknown,
): value is ConversationSceneKind {
  return (
    typeof value === 'string' &&
    CONVERSATION_SCENE_KINDS.includes(value as ConversationSceneKind)
  );
}

export function defaultConversationIconKey(role: unknown): ConversationIconKey {
  const normalized = typeof role === 'string' ? role.toLowerCase() : '';
  if (/학생|수강생|학습자/.test(normalized)) return 'student';
  if (/교사|선생|교수|강사/.test(normalized)) return 'teacher';
  if (/공무원|정부|행정|공공/.test(normalized)) return 'public_official';
  if (/직원|근로자|노동자/.test(normalized)) return 'employee';
  if (/사장|고용주|사업주/.test(normalized)) return 'employer';
  if (/고객|소비자/.test(normalized)) return 'customer';
  if (/의사|간호|환자|의료/.test(normalized)) return 'hospital';
  if (/판사|법원|변호/.test(normalized)) return 'court';
  if (/전문가|상담사/.test(normalized)) return 'expert';
  if (/기관|회사|기업|단체/.test(normalized)) return 'organization';
  if (/주민|시민/.test(normalized)) return 'citizen';
  if (/집단|회원|여러/.test(normalized)) return 'group';
  return 'person';
}

export function emptyConversationVisualAid(): ConversationVisualAid {
  return { kind: 'none', actor_ids: [], relations: [] };
}

export function parseConversationVisualMetadata(
  rawSceneKind: unknown,
  rawVisualAid: unknown,
  participants: readonly ConversationParticipantIdentity[],
  messages: readonly ConversationMessageIdentity[],
): ConversationVisualMetadata | null {
  const scene_kind = rawSceneKind === undefined ? 'none' : rawSceneKind;
  if (!isConversationSceneKind(scene_kind)) return null;
  if (rawVisualAid === undefined) {
    return { scene_kind, visual_aid: emptyConversationVisualAid() };
  }
  if (
    !isRecord(rawVisualAid) ||
    !hasOnlyKeys(rawVisualAid, ['kind', 'actor_ids', 'relations']) ||
    (rawVisualAid.kind !== 'none' && rawVisualAid.kind !== 'actor_flow') ||
    !Array.isArray(rawVisualAid.actor_ids) ||
    !Array.isArray(rawVisualAid.relations)
  ) {
    return null;
  }

  const participantIds = new Set(participants.map(({ id }) => id));
  const actor_ids = rawVisualAid.actor_ids.map(nonEmptyText);
  if (
    actor_ids.some((id) => id === null) ||
    actor_ids.some((id) => id !== null && !participantIds.has(id)) ||
    new Set(actor_ids).size !== actor_ids.length
  ) {
    return null;
  }

  const relations: ConversationVisualRelation[] = [];
  for (const rawRelation of rawVisualAid.relations) {
    if (
      !isRecord(rawRelation) ||
      !hasOnlyKeys(rawRelation, [
        'from_id',
        'to_id',
        'action_key',
        'evidence_message_indexes',
      ]) ||
      !Array.isArray(rawRelation.evidence_message_indexes)
    ) {
      return null;
    }
    const from_id = nonEmptyText(rawRelation.from_id);
    const to_id = nonEmptyText(rawRelation.to_id);
    const action_key = rawRelation.action_key;
    const evidence_message_indexes = rawRelation.evidence_message_indexes;
    if (
      from_id === null ||
      to_id === null ||
      from_id === to_id ||
      !participantIds.has(from_id) ||
      !participantIds.has(to_id) ||
      !actor_ids.includes(from_id) ||
      !actor_ids.includes(to_id) ||
      typeof action_key !== 'string' ||
      !CONVERSATION_ACTION_KEYS.includes(action_key as ConversationActionKey) ||
      evidence_message_indexes.length === 0 ||
      evidence_message_indexes.some(
        (index) =>
          !Number.isInteger(index) || index < 0 || index >= messages.length,
      ) ||
      new Set(evidence_message_indexes).size !==
        evidence_message_indexes.length ||
      !evidence_message_indexes.some(
        (index) => messages[index]?.p_id === from_id,
      )
    ) {
      return null;
    }
    relations.push({
      from_id,
      to_id,
      action_key: action_key as ConversationActionKey,
      evidence_message_indexes,
    });
  }

  if (
    (rawVisualAid.kind === 'none' &&
      (actor_ids.length !== 0 || relations.length !== 0)) ||
    (rawVisualAid.kind === 'actor_flow' &&
      (actor_ids.length < 2 ||
        actor_ids.length > 4 ||
        relations.length < 1 ||
        relations.length > 4))
  ) {
    return null;
  }

  return {
    scene_kind,
    visual_aid: {
      kind: rawVisualAid.kind,
      actor_ids: actor_ids as string[],
      relations,
    },
  };
}

export function normalizeConversationVisualMetadata(
  input: Record<string, unknown>,
  participants: readonly Readonly<{
    id: string;
    role: string;
    icon_key?: unknown;
  }>[],
): ConversationVisualMetadata & {
  participant_icon_keys: readonly ConversationIconKey[];
} {
  const participant_icon_keys = participants.map((participant) =>
    isConversationIconKey(participant.icon_key)
      ? participant.icon_key
      : defaultConversationIconKey(participant.role),
  );
  const visual = parseConversationVisualMetadata(
    input.scene_kind,
    input.visual_aid,
    participants,
    Array.isArray(input.messages)
      ? input.messages.filter(
          (message): message is ConversationMessageIdentity =>
            isRecord(message) && typeof message.p_id === 'string',
        )
      : [],
  );
  return {
    scene_kind: visual?.scene_kind ?? 'none',
    visual_aid: visual?.visual_aid ?? emptyConversationVisualAid(),
    participant_icon_keys,
  };
}
