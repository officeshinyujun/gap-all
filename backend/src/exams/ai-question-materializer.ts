import { Difficulty } from '../entities/exam-record.entity';
import { defaultConversationIconKey } from './conversation-visual-aid-validator';
import { deriveAiAnswer } from './ai-answer-engine';
import type {
  AiQuestionBlueprint,
  AiQuestionCandidate,
} from './ai-blueprint.types';

export type AiMaterializedQuestion = Readonly<{
  targetConcept: string;
  itemType: string;
  difficulty: Difficulty;
  recommendedTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME' | 'TPL_CONVERSATIONAL_FLOW';
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
  if (
    blueprint.template !== 'TPL_CASE_DIAGNOSTIC_FRAME' &&
    blueprint.template !== 'TPL_CONVERSATIONAL_FLOW'
  ) {
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
      ? '다음 사례에 대한 설명으로 옳지 않은 것은?'
      : '다음 사례에 대한 설명으로 옳은 것은?';
  const optionsList =
    blueprint.sourceArchetype === undefined
      ? [blueprint.targetConcept, ...blueprint.distractorConcepts].map(
          (concept, index) => `${['①', '②', '③', '④', '⑤'][index]} ${concept}`,
        )
      : derivedAnswer.optionsList;
  const stimulusData =
    blueprint.template === 'TPL_CONVERSATIONAL_FLOW'
      ? conversationStimulusData(blueprint, candidate)
      : {
          case_profile: {
            name: 'AI 생성 사례',
            context: '제시된 상황을 개념과 연결하여 판단한다.',
          },
          narrative: candidate.stemText,
          check_items: [],
        };
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
      recommendedTemplate:
        blueprint.template === 'TPL_CONVERSATIONAL_FLOW'
          ? 'TPL_CONVERSATIONAL_FLOW'
          : 'TPL_CASE_DIAGNOSTIC_FRAME',
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

function conversationStimulusData(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
): Record<string, unknown> | null {
  const contract = blueprint.conversationContract;
  const messages = candidate.messages;
  if (
    contract === undefined ||
    messages === undefined ||
    messages.length !== contract.speakerSequence.length
  ) {
    return null;
  }
  if (
    messages.some(
      (message, index) =>
        message.speakerId !== contract.speakerSequence[index] ||
        message.text.trim() === '',
    )
  ) {
    return null;
  }
  return {
    participants: contract.participants.map((participant) => ({
      ...participant,
      icon_key: defaultConversationIconKey(participant.role),
    })),
    messages: messages.map((message, index) => ({
      p_id: message.speakerId,
      text: message.text.trim(),
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

function asDifficulty(value: string): Difficulty {
  const allowed = Object.values(Difficulty);
  return allowed.includes(value as Difficulty)
    ? (value as Difficulty)
    : Difficulty.MIDDLE;
}
