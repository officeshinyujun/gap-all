import {
  type ConversationIconKey,
  type ConversationSceneKind,
  type ConversationVisualAid,
  defaultConversationIconKey,
  isConversationIconKey,
  parseConversationVisualMetadata,
} from './conversation-visual-aid-validator';

export const INTERVIEW_SCENE_KIND = 'interview' as const;

export type InterviewRejectionReason =
  | 'MISSING_INTERVIEW_MARKER'
  | 'MISSING_INTERVIEWER'
  | 'INVALID_TURN_COUNT'
  | 'INVALID_PARTICIPANT_COUNT'
  | 'NON_ALTERNATING_TURNS';

export type SourceInterviewResult =
  | Readonly<{ eligible: true }>
  | Readonly<{ eligible: false; reason: InterviewRejectionReason }>;

type SourceInterviewInput = Readonly<{
  stem: string;
  stimulus: string;
}>;

type ConversationParticipant = Readonly<{
  id: string;
  name: string;
  role: string;
  icon_key: ConversationIconKey;
}>;

type ConversationMessage = Readonly<{
  p_id: string;
  text: string;
  timestamp: string;
}>;

export type StoredConversationData = Readonly<{
  participants: readonly ConversationParticipant[];
  messages: readonly ConversationMessage[];
  scene_kind: ConversationSceneKind;
  visual_aid: ConversationVisualAid;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function parseSourceTurns(stimulus: string): readonly Readonly<{
  speaker: string;
  text: string;
}>[] {
  const turns: Array<Readonly<{ speaker: string; text: string }>> = [];
  for (const sourceLine of stimulus.split(/\r?\n/)) {
    const line = sourceLine.trim();
    const match = line.match(
      /^[-*\u2022\s]*\[?([^:\]\n]{1,40})\]?\s*:\s*(.+)$/,
    );
    if (match === null) continue;
    const speaker = nonEmptyText(match[1]);
    const text = nonEmptyText(match[2]);
    if (speaker === null || text === null) continue;
    turns.push({ speaker, text });
  }
  return turns;
}

function hasAlternatingTurns(
  turns: readonly Readonly<{ speaker: string }>[],
): boolean {
  return turns.every(
    (turn, index) => index === 0 || turns[index - 1]?.speaker !== turn.speaker,
  );
}

function isInterviewerLabel(label: string): boolean {
  return /^(기자|인터뷰어|interviewer)$/i.test(label.trim());
}

export function parseSourceInterview(
  input: SourceInterviewInput,
): SourceInterviewResult {
  if (!/\binterview\b|인터뷰/i.test(input.stem)) {
    return { eligible: false, reason: 'MISSING_INTERVIEW_MARKER' };
  }

  const turns = parseSourceTurns(input.stimulus);
  if (turns.length < 2 || turns.length > 4) {
    return { eligible: false, reason: 'INVALID_TURN_COUNT' };
  }

  const speakers = new Set(turns.map((turn) => turn.speaker));
  if (speakers.size !== 2) {
    return { eligible: false, reason: 'INVALID_PARTICIPANT_COUNT' };
  }
  if (!turns.some((turn) => isInterviewerLabel(turn.speaker))) {
    return { eligible: false, reason: 'MISSING_INTERVIEWER' };
  }
  if (!hasAlternatingTurns(turns)) {
    return { eligible: false, reason: 'NON_ALTERNATING_TURNS' };
  }
  return { eligible: true };
}

export function parseConversationForStorage(
  value: unknown,
): StoredConversationData | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'participants',
      'messages',
      'scene_kind',
      'visual_aid',
    ])
  ) {
    return null;
  }
  if (!Array.isArray(value.participants) || !Array.isArray(value.messages)) {
    return null;
  }

  const participants: ConversationParticipant[] = [];
  for (const rawParticipant of value.participants) {
    if (
      !isRecord(rawParticipant) ||
      !hasOnlyKeys(rawParticipant, ['id', 'name', 'role', 'icon_key'])
    ) {
      return null;
    }
    const id = nonEmptyText(rawParticipant.id);
    const name = nonEmptyText(rawParticipant.name);
    const role = nonEmptyText(rawParticipant.role);
    if (id === null || name === null || role === null) return null;
    if (
      rawParticipant.icon_key !== undefined &&
      !isConversationIconKey(rawParticipant.icon_key)
    ) {
      return null;
    }
    participants.push({
      id,
      name,
      role,
      icon_key:
        rawParticipant.icon_key === undefined
          ? defaultConversationIconKey(role)
          : rawParticipant.icon_key,
    });
  }

  if (participants.length === 0) return null;
  const participantIds = new Set(
    participants.map((participant) => participant.id),
  );
  if (participantIds.size !== participants.length) return null;

  const messages: ConversationMessage[] = [];
  for (const rawMessage of value.messages) {
    if (
      !isRecord(rawMessage) ||
      !hasOnlyKeys(rawMessage, ['p_id', 'text', 'timestamp'])
    ) {
      return null;
    }
    const participantId = nonEmptyText(rawMessage.p_id);
    const text = nonEmptyText(rawMessage.text);
    if (
      participantId === null ||
      text === null ||
      typeof rawMessage.timestamp !== 'string' ||
      !participantIds.has(participantId)
    ) {
      return null;
    }
    messages.push({
      p_id: participantId,
      text,
      timestamp: rawMessage.timestamp,
    });
  }

  if (messages.length === 0) return null;
  const visual = parseConversationVisualMetadata(
    value.scene_kind,
    value.visual_aid,
    participants,
    messages,
  );
  return visual === null ? null : { participants, messages, ...visual };
}

function isInterviewConversation(
  conversation: StoredConversationData,
): boolean {
  if (
    conversation.participants.length !== 2 ||
    conversation.messages.length < 2 ||
    conversation.messages.length > 4
  ) {
    return false;
  }
  return conversation.messages.every(
    (message, index) =>
      index === 0 || conversation.messages[index - 1]?.p_id !== message.p_id,
  );
}

export function deriveInterviewSceneKind(
  source: SourceInterviewInput,
  generatedConversation: unknown,
): typeof INTERVIEW_SCENE_KIND | null {
  if (!parseSourceInterview(source).eligible) return null;
  const conversation = parseConversationForStorage(generatedConversation);
  return conversation !== null && isInterviewConversation(conversation)
    ? INTERVIEW_SCENE_KIND
    : null;
}
