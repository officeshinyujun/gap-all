import { Difficulty } from '../entities/exam-record.entity';
import { defaultConversationIconKey } from './conversation-visual-aid-validator';
import { deriveAiAnswer } from './ai-answer-engine';
import type {
  AiQuestionBlueprint,
  AiQuestionCandidate,
} from './ai-blueprint.types';
import type { StructuredTplName } from './tpl-schemas';
import { materializeSourcePreservingTpl } from './source-preserving-tpl-adapter';

export type AiMaterializedQuestion = Readonly<{
  targetConcept: string;
  itemType: string;
  difficulty: Difficulty;
  recommendedTemplate: StructuredTplName;
  questionStem: string;
  stimulusData: Record<string, unknown>;
  optionsList: readonly string[];
  comboBlock: null;
  explanation: Readonly<{ judgment: string }>;
  correctAnswer: 1 | 2 | 3 | 4 | 5;
  unitName: string;
  setGroupId: null;
  setPosition: null;
}>;

export type AiMaterializationResult =
  | Readonly<{ kind: 'accepted'; question: AiMaterializedQuestion }>
  | Readonly<{
      kind: 'rejected';
      code: 'AI_DISTRACTOR_INVALID' | 'AI_CANDIDATE_SCHEMA_INVALID';
      message: string;
    }>;

export function materializeAiQuestion(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
): AiMaterializationResult {
  if (blueprint.distractorConcepts.length !== 4) {
    return {
      kind: 'rejected',
      code: 'AI_DISTRACTOR_INVALID',
      message: '정확히 네 개의 검증된 오답 개념이 필요합니다.',
    };
  }
  if (!isMaterializableTemplate(blueprint.template)) {
    return {
      kind: 'rejected',
      code: 'AI_CANDIDATE_SCHEMA_INVALID',
      message: '현재 AI materializer가 지원하지 않는 템플릿입니다.',
    };
  }
  const archetype = blueprint.sourceArchetype;
  if (
    archetype !== undefined &&
    (archetype.sourceTemplate !== blueprint.template ||
      archetype.responseMode !== 'single_selection' ||
      archetype.choiceTopology !== 'single_choice' ||
      !['positive_single_selection', 'negative_single_selection'].includes(
        archetype.stemIntent,
      ))
  ) {
    return {
      kind: 'rejected',
      code: 'AI_CANDIDATE_SCHEMA_INVALID',
      message:
        '현재 AI case materializer와 archetype 계약이 일치하지 않습니다.',
    };
  }
  const derivedAnswer = deriveAiAnswer(blueprint);
  if (derivedAnswer === null) {
    return {
      kind: 'rejected',
      code: 'AI_DISTRACTOR_INVALID',
      message:
        '서버 answer engine이 유효한 다섯 개 선택지를 만들지 못했습니다.',
    };
  }
  const questionStem =
    archetype?.stemIntent === 'negative_single_selection'
      ? blueprint.template === 'TPL_CASE_DIAGNOSTIC_FRAME'
        ? '다음 사례에 대한 설명으로 옳지 않은 것은?'
        : '다음 자료에 대한 설명으로 옳지 않은 것은?'
      : blueprint.template === 'TPL_CASE_DIAGNOSTIC_FRAME'
        ? '다음 사례에 대한 설명으로 옳은 것은?'
        : '다음 자료에 대한 설명으로 옳은 것은?';
  // ponytail: the server answer engine owns choices; provider prose is validated
  // separately and never becomes the persisted answer surface.
  const optionsList = derivedAnswer.optionsList;
  const stimulusData = materializeStimulus(blueprint, candidate);
  if (stimulusData === null) {
    return {
      kind: 'rejected',
      code: 'AI_CANDIDATE_SCHEMA_INVALID',
      message: '대화 후보가 서버가 고정한 발화자와 순서를 만족하지 않습니다.',
    };
  }
  return {
    kind: 'accepted',
    question: {
      targetConcept: blueprint.targetConcept,
      itemType: `ai_blueprint_${blueprint.family}`,
      difficulty: asDifficulty(blueprint.difficulty),
      recommendedTemplate: blueprint.template as StructuredTplName,
      questionStem:
        archetype === undefined && blueprint.family === 'calculation'
          ? '다음 상황에 대한 계산 결과로 가장 적절한 것은?'
          : questionStem,
      stimulusData,
      optionsList,
      comboBlock: null,
      explanation: { judgment: candidate.explanationText },
      correctAnswer: derivedAnswer.correctAnswer,
      unitName: `${blueprint.unitNumber}단원`,
      setGroupId: null,
      setPosition: null,
    },
  };
}

export function materializeSourcePreservingFallback(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
): AiMaterializationResult {
  if (!isSourcePreservingTemplate(blueprint.template)) {
    return { kind: 'rejected', code: 'AI_CANDIDATE_SCHEMA_INVALID', message: 'source-preserving fallback is not safe for this TPL' };
  }
  const source = materializeSourcePreservingTpl(
    blueprint.template,
    blueprint.caseContext,
  );
  if (source === null) {
    return { kind: 'rejected', code: 'AI_CANDIDATE_SCHEMA_INVALID', message: 'certified source is not renderer-valid' };
  }
  return materializeAiQuestion(blueprint, {
    ...candidate,
    stemText: blueprint.caseContext ?? candidate.stemText,
    choiceTexts: undefined,
    messageTexts: undefined,
    cellTexts: undefined,
    paragraphTexts: undefined,
    detailTexts: undefined,
    stepTexts: undefined,
  });
}

function isMaterializableTemplate(template: string): template is StructuredTplName {
  return [
    'TPL_CASE_DIAGNOSTIC_FRAME',
    'TPL_CONVERSATIONAL_FLOW',
    'TPL_COMPARATIVE_MATRIX',
    'TPL_FORMAL_DOCUMENT',
    'TPL_ARTICLE',
    'TPL_ANNOUNCEMENT',
    'TPL_SEQUENTIAL_WORKFLOW',
    'TPL_DIGITAL_FORUM_INTERFACE',
    'TPL_INSTRUCTIONAL_SCENE',
    'TPL_PROMOTIONAL_CANVAS',
    'TPL_INCIDENT_REPORT',
    'TPL_REPORT',
    'TPL_QUANTITATIVE_CHART',
    'TPL_STATISTICS',
  ].includes(template as StructuredTplName);
}

function materializeStimulus(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
): Record<string, unknown> | null {
  switch (blueprint.template) {
    case 'TPL_CONVERSATIONAL_FLOW':
      return conversationStimulusData(blueprint, candidate);
    case 'TPL_CASE_DIAGNOSTIC_FRAME':
      return {
        case_profile: {
          name: 'AI 생성 사례',
          context: '제시된 상황을 개념과 연결하여 판단한다.',
        },
        narrative: candidate.stemText,
        check_items: [],
      };
    case 'TPL_COMPARATIVE_MATRIX':
      return matrixStimulusData(blueprint, candidate);
    case 'TPL_FORMAL_DOCUMENT':
      return documentStimulusData(blueprint, candidate);
    case 'TPL_ARTICLE':
      return articleStimulusData(blueprint, candidate);
    case 'TPL_ANNOUNCEMENT':
      return announcementStimulusData(blueprint, candidate);
    case 'TPL_SEQUENTIAL_WORKFLOW':
      return workflowStimulusData(blueprint, candidate);
    case 'TPL_DIGITAL_FORUM_INTERFACE':
    case 'TPL_INSTRUCTIONAL_SCENE':
    case 'TPL_PROMOTIONAL_CANVAS':
    case 'TPL_INCIDENT_REPORT':
    case 'TPL_REPORT':
    case 'TPL_QUANTITATIVE_CHART':
    case 'TPL_STATISTICS':
      return materializeSourcePreservingTpl(blueprint.template, blueprint.caseContext);
    default:
      return null;
  }
}

function sourceLines(blueprint: AiQuestionBlueprint): string[] {
  return (blueprint.sourceSlotTexts ?? (blueprint.caseContext ?? '').split(/\n+/u))
    .map((line) => line.trim())
    .filter(Boolean);
}

function matrixStimulusData(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
): Record<string, unknown> | null {
  const lines = sourceLines(blueprint).filter((line) => line.includes('|'));
  if (lines.length < 2 || candidate.cellTexts === undefined) return null;
  const split = (line: string) =>
    line.split('|').map((cell) => cell.trim()).filter(Boolean);
  const headers = split(lines[0] ?? '');
  const sourceRows = lines.slice(1).filter((line) => !/^\|?\s*:?-+:?/u.test(line));
  const rows = sourceRows.map((line, rowIndex) => ({
    id: `row-${rowIndex + 1}`,
    cells: split(line),
  }));
  const cellCount = rows.reduce((count, row) => count + row.cells.length, 0);
  if (headers.length === 0 || rows.length === 0 || (blueprint.providerSlotCount !== undefined && cellCount !== blueprint.providerSlotCount) || cellCount !== candidate.cellTexts.length) {
    return null;
  }
  let index = 0;
  return {
    headers: headers.map((label, headerIndex) => ({ id: `col-${headerIndex + 1}`, label })),
    rows: rows.map((row) => ({ ...row, cells: row.cells.map(() => candidate.cellTexts![index++]) })),
    selection_chips: [],
  };
}

function documentStimulusData(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
): Record<string, unknown> | null {
  const paragraphs = sourceLines(blueprint);
  if (paragraphs.length === 0 || (blueprint.providerSlotCount !== undefined && paragraphs.length !== blueprint.providerSlotCount) || candidate.paragraphTexts?.length !== paragraphs.length) return null;
  return {
    doc_type: '공식 문서',
    header_info: {
      title: blueprint.targetConcept,
      date: paragraphs[0]!,
      author: paragraphs[1] ?? paragraphs[0]!,
    },
    paragraphs: paragraphs.map((_, index) => ({ sub_title: `문단 ${index + 1}`, content: candidate.paragraphTexts![index] })),
    footnotes: [],
  };
}

function articleStimulusData(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
): Record<string, unknown> | null {
  const paragraphs = sourceLines(blueprint);
  if (paragraphs.length === 0 || (blueprint.providerSlotCount !== undefined && paragraphs.length !== blueprint.providerSlotCount) || candidate.paragraphTexts?.length !== paragraphs.length) return null;
  return { title: blueprint.targetConcept, body_paragraphs: candidate.paragraphTexts };
}

function announcementStimulusData(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
): Record<string, unknown> | null {
  const details = sourceLines(blueprint);
  if (details.length === 0 || (blueprint.providerSlotCount !== undefined && details.length !== blueprint.providerSlotCount) || candidate.detailTexts?.length !== details.length) return null;
  return {
    title: blueprint.targetConcept,
    organizer: details[0]!,
    schedule: { start: details[0]!, end: details[details.length - 1]! },
    location: details[0]!,
    target: details[0]!,
    details: details.map((_, index) => ({ label: `안내 ${index + 1}`, content: candidate.detailTexts![index] })),
    contact: details[details.length - 1]!,
  };
}

function workflowStimulusData(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
): Record<string, unknown> | null {
  const steps = sourceLines(blueprint);
  if (steps.length === 0 || (blueprint.providerSlotCount !== undefined && steps.length !== blueprint.providerSlotCount) || candidate.stepTexts?.length !== steps.length) return null;
  return {
    orientation: 'vertical',
    steps: steps.map((_, index) => ({ idx: index, label: `단계 ${index + 1}`, desc: candidate.stepTexts![index], is_missing: false })),
  };
}

function conversationStimulusData(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
): Record<string, unknown> | null {
  const contract = blueprint.conversationContract;
  const messageTexts = candidate.messageTexts ?? sourceConversationTexts(blueprint);
  if (
    contract === undefined ||
    messageTexts === undefined ||
    (blueprint.providerSlotCount !== undefined && messageTexts.length !== blueprint.providerSlotCount) || messageTexts.length !== contract.speakerSequence.length
  ) {
    return null;
  }
  if (messageTexts.some((text) => text.trim() === '')) {
    return null;
  }
  return {
    participants: contract.participants.map((participant) => ({
      ...participant,
      icon_key: defaultConversationIconKey(participant.role),
    })),
    messages: messageTexts.map((text, index) => ({
      p_id: contract.speakerSequence[index],
      text: text.trim(),
      timestamp: String(index + 1),
    })),
    scene_kind: contract.sceneKind,
    visual_aid: {
      kind: 'none',
      actor_ids: [],
      relations: [],
    },
  };
}

function sourceConversationTexts(
  blueprint: AiQuestionBlueprint,
): readonly string[] | undefined {
  const contract = blueprint.conversationContract;
  if (contract === undefined) return undefined;
  const values = (blueprint.caseContext ?? '').split('\n')
    .map((line) => /^\s*([^:：]{1,20}?)\s*[:：](.+)$/u.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ name: match[1]!.trim(), text: match[2]!.trim() }))
    .filter(({ name, text }) => name !== '' && text !== '');
  if (values.length !== contract.speakerSequence.length) return undefined;
  const participantByName = new Map(
    contract.participants.map((participant) => [participant.name, participant.id]),
  );
  const speakerSequence = values.map(({ name }) => participantByName.get(name));
  if (speakerSequence.some((id, index) => id !== contract.speakerSequence[index])) {
    return undefined;
  }
  return values.map(({ text }) => text);
}

function isSourcePreservingTemplate(template: string): template is StructuredTplName {
  return [
    'TPL_DIGITAL_FORUM_INTERFACE', 'TPL_INSTRUCTIONAL_SCENE',
    'TPL_PROMOTIONAL_CANVAS', 'TPL_INCIDENT_REPORT', 'TPL_REPORT',
    'TPL_QUANTITATIVE_CHART', 'TPL_STATISTICS',
  ].includes(template as StructuredTplName);
}

function asDifficulty(value: string): Difficulty {
  const allowed = Object.values(Difficulty);
  return allowed.includes(value as Difficulty)
    ? (value as Difficulty)
    : Difficulty.MIDDLE;
}
