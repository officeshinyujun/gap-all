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
  comboBlock: Readonly<{ title: string; items: readonly Readonly<{ key: string; text: string }>[] }> | null;
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
  const isTruthCombination =
    archetype?.stemIntent === 'truth_combination' ||
    archetype?.responseMode === 'truth_combination';
  if (
    archetype !== undefined &&
    !isTruthCombination &&
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
  const questionStem = isTruthCombination
    ? '다음 자료에 대한 분석으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?'
    : archetype?.stemIntent === 'negative_single_selection'
      ? blueprint.template === 'TPL_CASE_DIAGNOSTIC_FRAME'
        ? '다음 사례에 대한 설명으로 옳지 않은 것은?'
        : '다음 자료에 대한 설명으로 옳지 않은 것은?'
      : blueprint.template === 'TPL_CASE_DIAGNOSTIC_FRAME'
        ? '다음 사례에 대한 설명으로 옳은 것은?'
        : '다음 자료에 대한 설명으로 옳은 것은?';
  const optionsList =
    blueprint.template === 'TPL_CASE_DIAGNOSTIC_FRAME' &&
    archetype !== undefined &&
    !isTruthCombination &&
    blueprint.sourceChoiceTexts === undefined &&
    candidate.choiceTexts !== undefined
      ? candidate.choiceTexts
      : derivedAnswer.optionsList;
  const stimulusData = materializeStimulus(
    blueprint,
    candidate,
    isTruthCombination,
  );
  if (stimulusData === null) {
    return {
      kind: 'rejected',
      code: 'AI_CANDIDATE_SCHEMA_INVALID',
      message: `인증된 ${blueprint.template} 자료 구조를 materialize할 수 없습니다.`,
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
      comboBlock: isTruthCombination
        ? sourceViewComboBlock(blueprint.sourceViewItems)
        : null,
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

function caseProfileName(narrative: string): string {
  return (
    narrative.match(
      /(?:^|[\n。])\s*([A-Za-z가-힣○]{1,12}(?:씨|님|팀장|대표|사장|학생|교사|근로자))/u,
    )?.[1] ?? '사례'
  );
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
  preserveCertifiedSource: boolean,
): Record<string, unknown> | null {
  switch (blueprint.template) {
    case 'TPL_CONVERSATIONAL_FLOW':
      return conversationStimulusData(blueprint, candidate, preserveCertifiedSource);
    case 'TPL_CASE_DIAGNOSTIC_FRAME':
      // ponytail: truth-combination remains source-preserving until generated
      // view-item semantics have a verifier; this prevents unsolvable hybrids.
      {
        const narrative = preserveCertifiedSource
          ? blueprint.caseContext ?? candidate.stemText
          : candidate.stemText;
        return {
          case_profile: { name: caseProfileName(narrative), context: '' },
          narrative,
          check_items: [],
        };
      }
    case 'TPL_COMPARATIVE_MATRIX':
      return matrixStimulusData(blueprint, candidate, preserveCertifiedSource);
    case 'TPL_FORMAL_DOCUMENT':
      return documentStimulusData(blueprint, candidate, preserveCertifiedSource);
    case 'TPL_ARTICLE':
      return articleStimulusData(blueprint, candidate, preserveCertifiedSource);
    case 'TPL_ANNOUNCEMENT':
      return announcementStimulusData(blueprint, candidate, preserveCertifiedSource);
    case 'TPL_SEQUENTIAL_WORKFLOW':
      return workflowStimulusData(blueprint, candidate, preserveCertifiedSource);
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
  preserveCertifiedSource: boolean,
): Record<string, unknown> | null {
  const lines = (blueprint.caseContext ?? '')
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line.includes('|'));
  if (lines.length < 2 || (!preserveCertifiedSource && candidate.cellTexts === undefined)) return null;
  const split = (line: string) =>
    line.split('|').map((cell) => cell.trim()).filter(Boolean);
  const headers = split(lines[0] ?? '');
  const sourceRows = lines.slice(1).filter((line) => !/^\|?\s*:?-+:?/u.test(line));
  const rows = sourceRows.map((line, rowIndex) => ({
    id: `row-${rowIndex + 1}`,
    cells: split(line),
  }));
  const cellCount = rows.reduce((count, row) => count + row.cells.length, 0);
  if (
    headers.length === 0 ||
    rows.length === 0 ||
    rows.some((row) => row.cells.length !== headers.length) ||
    (blueprint.providerSlotCount !== undefined && cellCount !== blueprint.providerSlotCount) ||
    (!preserveCertifiedSource && cellCount !== candidate.cellTexts?.length)
  ) {
    return null;
  }
  const sourceCells = rows.flatMap((row) => row.cells);
  const cellTexts = preserveCertifiedSource ? sourceCells : candidate.cellTexts!;
  let index = 0;
  return {
    headers: headers.map((label, headerIndex) => ({ id: `col-${headerIndex + 1}`, label })),
    rows: rows.map((row) => ({ ...row, cells: row.cells.map(() => cellTexts[index++]) })),
    selection_chips: [],
  };
}

function documentStimulusData(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
  preserveCertifiedSource: boolean,
): Record<string, unknown> | null {
  const paragraphs = sourceLines(blueprint);
  const paragraphTexts = preserveCertifiedSource
    ? paragraphs
    : candidate.paragraphTexts;
  if (paragraphs.length === 0 || (blueprint.providerSlotCount !== undefined && paragraphs.length !== blueprint.providerSlotCount) || paragraphTexts?.length !== paragraphs.length) return null;
  return {
    doc_type: '공식 문서',
    header_info: {
      title: blueprint.targetConcept,
      date: paragraphs[0]!,
      author: paragraphs[1] ?? paragraphs[0]!,
    },
    paragraphs: paragraphs.map((_, index) => ({ sub_title: `문단 ${index + 1}`, content: paragraphTexts![index] })),
    footnotes: [],
  };
}

function articleStimulusData(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
  preserveCertifiedSource: boolean,
): Record<string, unknown> | null {
  const paragraphs = sourceLines(blueprint);
  const paragraphTexts = preserveCertifiedSource ? paragraphs : candidate.paragraphTexts;
  if (paragraphs.length === 0 || (blueprint.providerSlotCount !== undefined && paragraphs.length !== blueprint.providerSlotCount) || paragraphTexts?.length !== paragraphs.length) return null;
  return { title: blueprint.targetConcept, body_paragraphs: paragraphTexts };
}

function announcementStimulusData(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
  preserveCertifiedSource: boolean,
): Record<string, unknown> | null {
  const details = sourceLines(blueprint);
  const detailTexts = preserveCertifiedSource ? details : candidate.detailTexts;
  if (details.length === 0 || (blueprint.providerSlotCount !== undefined && details.length !== blueprint.providerSlotCount) || detailTexts?.length !== details.length) return null;
  return {
    title: blueprint.targetConcept,
    organizer: details[0]!,
    schedule: { start: details[0]!, end: details[details.length - 1]! },
    location: details[0]!,
    target: details[0]!,
    details: details.map((_, index) => ({ label: `안내 ${index + 1}`, content: detailTexts![index] })),
    contact: details[details.length - 1]!,
  };
}

function workflowStimulusData(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
  preserveCertifiedSource: boolean,
): Record<string, unknown> | null {
  const steps = sourceLines(blueprint);
  const stepTexts = preserveCertifiedSource ? steps : candidate.stepTexts;
  if (steps.length === 0 || (blueprint.providerSlotCount !== undefined && steps.length !== blueprint.providerSlotCount) || stepTexts?.length !== steps.length) return null;
  return {
    orientation: 'vertical',
    steps: steps.map((_, index) => ({ idx: index, label: `단계 ${index + 1}`, desc: stepTexts![index], is_missing: false })),
  };
}

function conversationStimulusData(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
  preserveCertifiedSource: boolean,
): Record<string, unknown> | null {
  const contract = blueprint.conversationContract;
  const messageTexts = preserveCertifiedSource
    ? sourceConversationTexts(blueprint)
    : candidate.messageTexts ?? sourceConversationTexts(blueprint);
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

function sourceViewComboBlock(
  viewItems: readonly string[] | undefined,
): AiMaterializedQuestion['comboBlock'] {
  if (viewItems === undefined || viewItems.length === 0) return null;
  const items = viewItems
    .map((item) => {
      const match = /^([ㄱ-ㅎ])\s*[\.\)]\s*(.+)$/u.exec(item.trim());
      return match ? { key: match[1]!, text: match[2]!.trim() } : null;
    })
    .filter((item): item is { key: string; text: string } => item !== null);
  if (items.length === 0) return null;
  return { title: '<보기>', items };
}

// ponytail: truth_combination 보기 항목(ㄱ.조건1, ㄴ.조건2 ...)을 caseContext(stimulus)에서 추출.
// 원본 stimulus 텍스트에서 <보기> 섹션이나 ㄱ./ㄴ./ㄷ./ㄹ. 패턴으로 파싱.
function extractViewItems(caseContext: string): string[] {
  const text = caseContext ?? '';
  // 보기 패턴: ㄱ. 텍스트, ㄴ. 텍스트 등
  const viewPattern = /^[ㄱ-ㅎ]\s*[\.\)]\s*(.+)$/gm;
  const matches = [...text.matchAll(viewPattern)];
  if (matches.length >= 2) {
    return matches.map((m) => m[1]?.trim() ?? '').filter(Boolean);
  }
  // 넘버링 패턴: 1. 텍스트, (1) 텍스트 등
  const numPattern = /^(?:\d+|[①-⑳])\s*[\.\)]\s*(.+)$/gm;
  const numMatches = [...text.matchAll(numPattern)];
  if (numMatches.length >= 2) {
    return numMatches.map((m) => m[1]?.trim() ?? '').filter(Boolean);
  }
  return [];
}
