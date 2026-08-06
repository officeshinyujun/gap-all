import { Inject, Injectable, Optional } from '@nestjs/common';
import type OpenAI from 'openai';
import { getOpenAIClient } from '../lib/openai-keys';
import {
  AI_BLUEPRINT_CONTRACT_VERSION,
  type AiGenerationFailureCode,
  type AiProviderTelemetry,
  type AiQuestionBlueprint,
  type AiQuestionCandidate,
  type AiCandidateRepairContext,
  type AiReferenceAnalysis,
} from './ai-blueprint.types';
import { stableHash } from './reference-selector.utils';
import { getTplGenerationSpec, type ProviderSlotField } from './ai-tpl-capabilities';

export const AI_BLUEPRINT_PROVIDER = 'AI_BLUEPRINT_PROVIDER';
export const AI_BLUEPRINT_PROMPT_VERSION = 'v2' as const;
export const AI_BLUEPRINT_VALIDATOR_VERSION = 'v2' as const;
export const AI_REFERENCE_ANALYSIS_PROMPT_VERSION = 'v1' as const;

export type AiModelRole = 'analysis' | 'candidate' | 'repair' | 'verification';

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_STEM_LENGTH = 700;
const MAX_EXPLANATION_LENGTH = 1_500;
const MAX_ANALYSIS_TEXT_LENGTH = 300;

export type AiProviderDependency = Readonly<{
  complete: (
    prompt: string,
    signal: AbortSignal,
    responseFormat?:
      | ReturnType<typeof aiCandidateResponseFormat>
      | ReturnType<typeof aiReferenceAnalysisResponseFormat>,
  ) => Promise<string | AiProviderCompletion>;
}>;

type AiProviderCompletion = Readonly<{
  content: string;
  model?: string;
  usage?: Readonly<{
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }>;
}>;

export class AiProviderError extends Error {
  readonly name = 'AiProviderError';

  constructor(
    readonly code: Extract<
      AiGenerationFailureCode,
      | 'AI_PROVIDER_TIMEOUT'
      | 'AI_PROVIDER_MALFORMED_OUTPUT'
      | 'AI_CANDIDATE_SCHEMA_INVALID'
    >,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class AiProviderAdapter {
  private readonly dependency: AiProviderDependency;
  private readonly timeoutMs: number;

  constructor(
    @Optional()
    @Inject(AI_BLUEPRINT_PROVIDER)
    dependency?: AiProviderDependency,
  ) {
    this.dependency = dependency ?? {
      complete: (prompt, signal, responseFormat) =>
        completeWithOpenAi(prompt, signal, responseFormat),
    };
    this.timeoutMs =
      Number(process.env.AI_BLUEPRINT_PROVIDER_TIMEOUT_MS) ||
      DEFAULT_TIMEOUT_MS;
  }

  async generate(
    blueprint: AiQuestionBlueprint,
    attempt: number,
    externalSignal?: AbortSignal,
    repair?: AiCandidateRepairContext,
  ): Promise<AiQuestionCandidate> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
    if (externalSignal?.aborted) controller.abort();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const prompt = buildAiCandidatePrompt(blueprint, attempt, repair);
      const completion = await this.dependency.complete(
        prompt,
        controller.signal,
        aiCandidateResponseFormat(blueprint, repair !== undefined),
      );
      const content =
        typeof completion === 'string' ? completion : completion.content;
      const candidate = parseAiQuestionCandidate(content, blueprint);
      const configuredModel = aiModelForRole(repair === undefined ? 'candidate' : 'repair');
      const model =
        typeof completion === 'string'
          ? configuredModel
          : completion.model ?? configuredModel;
      const usage =
        typeof completion === 'string' ? undefined : completion.usage;
      const telemetry: AiProviderTelemetry = {
        model,
        promptHash: stableHash(prompt),
        latencyMs: Date.now() - startedAt,
        usage:
          usage === undefined
            ? null
            : {
                promptTokens: usage.prompt_tokens,
                completionTokens: usage.completion_tokens,
                totalTokens: usage.total_tokens,
              },
      };
      return { ...candidate, telemetry };
    } catch (error: unknown) {
      if (error instanceof AiProviderError) throw error;
      if (controller.signal.aborted) {
        throw new AiProviderError(
          'AI_PROVIDER_TIMEOUT',
          'AI 후보 생성 시간이 초과되었습니다.',
        );
      }
      throw new AiProviderError(
        'AI_PROVIDER_MALFORMED_OUTPUT',
        'AI 후보 생성 응답을 처리할 수 없습니다.',
      );
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromCaller);
    }
  }

  async analyzeReference(
    source: Readonly<Record<string, unknown>>,
    externalSignal?: AbortSignal,
  ): Promise<AiReferenceAnalysis> {
    const prompt = JSON.stringify({
      task: 'Analyze one certified exam question for grounded variant generation.',
      promptVersion: AI_REFERENCE_ANALYSIS_PROMPT_VERSION,
      outputRules: [
        'Return only the requested JSON object.',
        'Describe the source question; never invent a new answer or fact.',
        'Keep invariant facts necessary to preserve the official answer logic.',
        'List surface details that may safely change in a variant.',
        'The stimulus must be necessary to solve the question.',
      ],
      source,
    });
    const controller = new AbortController();
    const abort = () => controller.abort();
    externalSignal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const completion = await this.dependency.complete(
        prompt,
        controller.signal,
        aiReferenceAnalysisResponseFormat(),
      );
      return parseAiReferenceAnalysis(
        typeof completion === 'string' ? completion : completion.content,
      );
    } catch (error: unknown) {
      if (error instanceof AiProviderError) throw error;
      if (controller.signal.aborted) {
        throw new AiProviderError('AI_PROVIDER_TIMEOUT', 'AI 원본 분석 시간이 초과되었습니다.');
      }
      throw new AiProviderError('AI_PROVIDER_MALFORMED_OUTPUT', 'AI 원본 분석 응답을 처리할 수 없습니다.');
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abort);
    }
  }
}

export function aiReferenceAnalysisResponseFormat() {
  const text = { type: 'string', minLength: 1, maxLength: MAX_ANALYSIS_TEXT_LENGTH };
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: 'ai_reference_analysis',
      strict: true as const,
      schema: {
        type: 'object',
        properties: {
          stemIntent: text,
          reasoningPattern: text,
          invariantFacts: {
            type: 'array', minItems: 1, maxItems: 12,
            items: { type: 'object', properties: { id: text, description: text }, required: ['id', 'description'], additionalProperties: false },
          },
          mutableSlots: {
            type: 'array', minItems: 1, maxItems: 12,
            items: { type: 'object', properties: { name: text, kind: { type: 'string', enum: ['text', 'enum', 'integer', 'decimal'] }, allowedValues: { type: ['array', 'null'], items: text } }, required: ['name', 'kind', 'allowedValues'], additionalProperties: false },
          },
          answerRule: { type: 'object', properties: { id: text, description: text }, required: ['id', 'description'], additionalProperties: false },
          distractorRules: { type: 'array', minItems: 1, maxItems: 8, items: text },
          stimulusRequired: { type: 'boolean', enum: [true] },
        },
        required: ['stemIntent', 'reasoningPattern', 'invariantFacts', 'mutableSlots', 'answerRule', 'distractorRules', 'stimulusRequired'],
        additionalProperties: false,
      },
    },
  };
}

export function parseAiReferenceAnalysis(content: string): AiReferenceAnalysis {
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch {
    throw new AiProviderError('AI_PROVIDER_MALFORMED_OUTPUT', 'AI 원본 분석이 유효한 JSON이 아닙니다.');
  }
  if (!isRecord(parsed) || parsed.stimulusRequired !== true ||
      !isBoundedText(parsed.stemIntent, MAX_ANALYSIS_TEXT_LENGTH) ||
      !isBoundedText(parsed.reasoningPattern, MAX_ANALYSIS_TEXT_LENGTH) ||
      !Array.isArray(parsed.invariantFacts) || parsed.invariantFacts.length === 0 ||
      !Array.isArray(parsed.mutableSlots) || parsed.mutableSlots.length === 0 ||
      !isRecord(parsed.answerRule) || !Array.isArray(parsed.distractorRules) ||
      parsed.distractorRules.length === 0 ||
      !parsed.distractorRules.every((item) => isBoundedText(item, MAX_ANALYSIS_TEXT_LENGTH))) {
    throw new AiProviderError('AI_CANDIDATE_SCHEMA_INVALID', 'AI 원본 분석 schema가 올바르지 않습니다.');
  }
  return parsed as AiReferenceAnalysis;
}

function templateExample(
  blueprint: AiQuestionBlueprint,
): string {
  const mode = blueprint.sourceArchetype?.stemIntent ?? 'positive_single_selection';
  const tpl = blueprint.template;
  // --- truth_combination (ㄱㄴㄷㄹ형): LLM이 사례만 생성, 선지와 보기는 서버가 생성 ---
  if (mode === 'truth_combination') {
    if (tpl === 'TPL_CASE_DIAGNOSTIC_FRAME') {
      return `[예시: truth_combination 사례 생성 — 근로기준법]
개념(targetConcept) = "근로기준법상 연소근로자 보호", 사례 맥락(caseContext) = "청소년 아르바이트생의 근로조건".
줄거리(stemText)는 개념명을 직접 노출하지 않고 구체적인 근로조건(나이, 근무시간, 임금, 수습기간 등)을 포함해야 한다.
보기(ㄱㄴㄷㄹ) 조건들은 이 사례의 세부 수치와 조건을 바탕으로 서버가 생성하므로, 사례에는 판단 가능한 구체적 정보가 충분히 포함되어야 한다.
올바른 출력 예:
{
  "stemText": "○○고등학교에 재학 중인 청소년 A씨(만 18세)는 상시 근로자가 5명인 △△음식점에서 매장 정리, 주방 보조 담당으로 평일(월~금) 오전 11시부터 오후 2시까지 시간당 11,000원을 받고 일하는 조건으로 근로 계약을 체결했고, 오늘이 첫 주급을 받는 날이다. A씨는 첫 주급을 기대하며 출근하였지만, 사장님이 이번 주는 수습 기간이라며 첫 5시간 근무에 대해서는 시급이 없다고 하였다.",
  "explanationText": "근로기준법상 연소근로자(만 18세 미만)는 1일 7시간, 1주 35시간을 초과하여 근로할 수 없으며, 사용자는 연소근로자에 대해 정당한 사유 없이 수습 기간을 이유로 임금을 삭감할 수 없다. 사례에서 A씨는 만 18세로 연소근로자 보호 대상이며, 사장님의 수습 기간 주장은 근로기준법에 위배된다."
}`;
    }
  }
  // --- single_selection (일반 선택형): LLM이 사례 + 선택지 + 해설 생성 ---
  if (tpl === 'TPL_CASE_DIAGNOSTIC_FRAME') {
    const polarityHint = mode === 'negative_single_selection'
      ? '(옳지 않은 것 고르기 — negative)'
      : '(옳은 것 고르기 — positive)';
    return `[예시: single_selection 사례+선택지 생성 ${polarityHint} — 노동 관련 법률]
개념(targetConcept) = "노동조합", 사례 맥락(caseContext) = "근로자들의 단체교섭과 쟁의행위".
줄거리(stemText)는 개념명("노동조합")을 직접 노출하지 않고 구체적인 행위(임금 인상 요구, 단체교섭, 파업)만으로 묘사해야 한다.
선택지(choiceTexts) 5개는 모두 "이 사례는 [개념]의 핵심 조건에 부합한다"라는 평행 구조여야 하며, 정답을 추측하게 하는 단서(길이 차이, 강조 표현)가 없어야 한다.
올바른 출력 예:
{
  "stemText": "A기업의 근로자 30명이 임금 인상을 요구하며 노동위원회에 조정을 신청하였다. 사용자는 경영상의 어려움을 이유로 임금 인상을 거부하였고, 근로자들은 단체교섭을 요구하였으나 사용자가 응하지 않았다. 이에 근로자들은 조합원 과반수의 찬성으로 파업을 결의하였다.",
  "choiceTexts": [
    "이 사례는 노동조합의 핵심 조건에 부합한다.",
    "이 사례는 직무 분석의 핵심 조건에 부합한다.",
    "이 사례는 인사 평가의 핵심 조건에 부합한다.",
    "이 사례는 경력 개발의 핵심 조건에 부합한다.",
    "이 사례는 직업 훈련의 핵심 조건에 부합한다."
  ],
  "explanationText": "노동조합은 근로자가 주체가 되어 근로 조건의 유지·개선을 목적으로 조직하는 단체이다. 사례에서 근로자들이 임금 인상을 요구하며 단체교섭과 쟁의행위(파업)를 추진한 것은 노동조합의 전형적인 활동에 해당한다. 한편 직무 분석, 인사 평가, 경력 개발, 직업 훈련은 인사 관리의 개별 활동이므로 이 사례와 관련이 없다."
}`;
  }
  // --- TPL_CONVERSATIONAL_FLOW (대화형) ---
  if (tpl === 'TPL_CONVERSATIONAL_FLOW') {
    return `[예시: 대화형(messageTexts) 생성 — 법률 상담 Q&A]
개념(targetConcept) = "근로기준법상 해고 제한", 대화 참여자는 blueprint.conversationContract에 명시됨.
각 messageTexts 항목은 해당 참여자의 대사이며, 개념명을 직접 노출하지 않고 구체적 상황만으로 구성해야 한다.
올바른 출력 예:
{
  "messageTexts": [
    "저는 ○○마트에서 8개월째 정규직으로 근무 중입니다. 지난주 지각을 세 번 했다는 이유로 사장님께서 내일부터 나오지 말라고 하셨습니다. 저는 매일 20분 일찍 출근했고, 지각은 교통사고로 인한 것이었습니다.",
    "근로기준법 제23조에 따라 사용자는 정당한 이유 없이 근로자를 해고할 수 없습니다. 8개월 근속 중 3회 지각이 해고 사유로 인정되려면, 사전에 취업규칙에 명시된 징계 절차를 거쳤어야 하며 지각의 귀책사유가 근로자에게 있어야 합니다."
  ],
  "explanationText": "근로기준법은 정당한 이유 없는 해고를 금지하며, 해고의 정당성은 사회통념상 고용관계를 계속할 수 없을 정도의 사유인지로 판단한다. 8개월 근속 중 3회 지각만으로는 정당한 해고 사유로 보기 어렵고, 특히 교통사고라는 불가항력적 사유가 있었다면 더욱 그러하다."
}`;
  }
  // fallback: default single_selection for templates that generate choices
  return '';
}

export function buildAiCandidatePrompt(
  blueprint: AiQuestionBlueprint,
  attempt: number,
  repair?: AiCandidateRepairContext,
): string {
  const slotField = providerSlotField(blueprint.template);
  const providerChoices = supportsGeneratedChoices(blueprint);
  return JSON.stringify({
    task: 'Write bounded prose for one question blueprint.',
    contractVersion: AI_BLUEPRINT_CONTRACT_VERSION,
    promptVersion: AI_BLUEPRINT_PROMPT_VERSION,
    attempt,
    repair: repair ?? null,
      outputRules: [
       providerChoices
         ? `Return exactly one JSON object with ${slotField ?? 'stemText'}, choiceTexts (exactly five), and explanationText.`
         : slotField !== undefined
         ? `Return exactly one JSON object with exactly ${slotField} and explanationText.`
        : 'Return exactly one JSON object with exactly stemText and explanationText.',
      providerChoices
        ? 'Return five complete, parallel choice statements. Do not return an answer number.'
        : 'Do not return choices, answer numbers, stimulus data, metadata, or lineage.',
       'Use only the blueprint concept, invariants, and permitted slots.',
       ...(repair === undefined ? [] : [
         `Repair the previous failure: ${repair.failureReason}.`,
         repair.requiredAnchors.length > 0
           ? `The following certified source anchors are mandatory and must appear unchanged: ${repair.requiredAnchors.join(', ')}.`
           : 'Preserve every certified source fact and required slot from the blueprint.',
       ]),
        'Do not invent source facts, official answers, numbers, tables, or diagrams.',
       // stemText is pure narrative. The server prepends the question stem ("다음 사례에...").
       // Do NOT write "무엇입니까?", "고르시오", "답하시오", or any question sentence.
       'CRITICAL: stemText is ONLY the case description (narrative prose). The server adds the question stem separately. Never end stemText with a question mark or include "~ 가장 적절한 것은?", "~ 옳은 것은?" etc.',
       slotField !== undefined
         ? `Keep every ${slotField} item at most ${MAX_STEM_LENGTH} characters.`
        : `Keep stemText at most ${MAX_STEM_LENGTH} characters.`,
      `Keep explanationText at most ${MAX_EXPLANATION_LENGTH} characters.`,
    ],
    ...(repair === undefined && blueprint.sourceArchetype !== undefined
      ? { example: templateExample(blueprint) }
      : {}),
    blueprint: {
      family: blueprint.family,
      unitNumber: blueprint.unitNumber,
      targetConcept: blueprint.targetConcept,
      template: blueprint.template,
      sourceArchetype: blueprint.sourceArchetype ?? null,
      generationContract:
        blueprint.sourceArchetype === undefined
          ? 'legacy blueprint contract'
          : {
              stemIntent: blueprint.sourceArchetype.stemIntent,
              polarity: blueprint.sourceArchetype.polarity,
              responseMode: blueprint.sourceArchetype.responseMode,
              choiceEncoding: blueprint.sourceArchetype.choiceEncoding,
              choiceTopology: blueprint.sourceArchetype.choiceTopology,
              materialKind: blueprint.sourceArchetype.materialKind,
              reasoningPattern: blueprint.sourceArchetype.reasoningPattern,
              sourceTemplate: blueprint.sourceArchetype.sourceTemplate,
              viewKeys: blueprint.sourceArchetype.viewKeys,
              viewItemCount: blueprint.sourceArchetype.viewItemCount,
              conceptRoleCardinality:
                blueprint.sourceArchetype.conceptRoleCardinality,
            },
      sourceContext: blueprint.caseContext ?? null,
      conversationContract: blueprint.conversationContract ?? null,
      variantOrdinal: blueprint.variantOrdinal ?? 1,
      invariantFacts: blueprint.invariantFacts,
      sourceFactAnchors: blueprint.sourceFactAnchors ?? [],
      mutableSlots: blueprint.mutableSlots,
      answerRule: blueprint.answerRule,
      distractorRule: blueprint.distractorRule,
      difficulty: blueprint.difficulty,
      instructions:
        blueprint.sourceArchetype === undefined
          ? undefined
          : [
              'The backend owns the question stem, template, choices, and answer.',
              'stemText is ONLY the case narrative (pure descriptive prose).',
              'The server prepends the question stem like "다음 사례에 대한 설명으로 옳은 것은?". Do NOT write question sentences yourself.',
              'Never include: "무엇입니까?", "고르시오", "답하시오", "가장 적절한 것은?", "옳은 것은?", or any question mark at end.',
              `Difficulty: ${blueprint.difficulty}. ${
                blueprint.difficulty === 'LOW'
                  ? 'Use straightforward scenarios with clear, obvious distinctions.'
                  : blueprint.difficulty === 'HIGH' || blueprint.difficulty === 'INTERGRATE'
                  ? 'Use complex multi-factor scenarios with subtle distinctions. Combine multiple concepts and edge cases.'
                  : 'Use moderate complexity with one or two judgment factors.'
              }`,
              blueprint.sourceArchetype.stemIntent ===
              'negative_single_selection'
                ? 'Preserve the negative question intent; do not turn it into a positive question.'
                : 'Preserve the positive question intent.',
            ],
    },
  });
}

export function parseAiQuestionCandidate(
  content: string,
  blueprint?: AiQuestionBlueprint,
): AiQuestionCandidate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiProviderError(
      'AI_PROVIDER_MALFORMED_OUTPUT',
      'AI 응답이 유효한 JSON이 아닙니다.',
    );
  }
  if (!isRecord(parsed)) {
    throw new AiProviderError(
      'AI_CANDIDATE_SCHEMA_INVALID',
      'AI 응답이 객체가 아닙니다.',
    );
  }
  const keys = Object.keys(parsed).sort();
  const providerChoices = supportsGeneratedChoices(blueprint);
  if (providerChoices) {
    const slotField = blueprint?.template === 'TPL_CASE_DIAGNOSTIC_FRAME'
      ? 'stemText'
      : providerSlotField(blueprint?.template);
    if (slotField === undefined) {
      throw new AiProviderError('AI_CANDIDATE_SCHEMA_INVALID', 'AI 후보 슬롯을 확인할 수 없습니다.');
    }
    const validSlot = slotField === 'stemText'
      ? isBoundedText(parsed[slotField], MAX_STEM_LENGTH)
      : isBoundedTextArray(parsed[slotField], blueprint);
    const validExplanation = isBoundedText(parsed.explanationText, MAX_EXPLANATION_LENGTH);
    const validChoices = Array.isArray(parsed.choiceTexts) &&
      parsed.choiceTexts.length === 5 &&
      parsed.choiceTexts.every((choice) => isBoundedText(choice, MAX_STEM_LENGTH));
    const explanationText = parsed.explanationText as string;
    const choiceTexts = parsed.choiceTexts as readonly string[];
    const legacyTextCandidate =
      blueprint?.template === 'TPL_CONVERSATIONAL_FLOW' &&
      canRecoverLegacyConversation(blueprint) &&
      keys.join(',') === 'explanationText,stemText' &&
      typeof parsed.stemText === 'string' && parsed.stemText.trim() !== '' &&
      typeof parsed.explanationText === 'string' && parsed.explanationText.trim() !== '';
    if (legacyTextCandidate) {
      // ponytail: the model's older two-field response is still safe because
      // answer, choices, template, and structured stimulus remain server-owned.
      return {
        stemText: (parsed.stemText as string).trim(),
        explanationText: explanationText.trim(),
      };
    }
    if (keys.join(',') === [slotField, 'explanationText'].sort().join(',') && validSlot && validExplanation) {
      // ponytail: keep the server-owned answer fallback when a provider ignores the optional choice prose.
      const values = Array.isArray(parsed[slotField])
        ? parsed[slotField].map((text) => text.trim())
        : [String(parsed[slotField]).trim()];
      return {
        stemText: values.join('\n'),
        ...(slotField === 'messageTexts' ? { messageTexts: values } : {}),
        ...(slotField === 'cellTexts' ? { cellTexts: values } : {}),
        ...(slotField === 'paragraphTexts' ? { paragraphTexts: values } : {}),
        ...(slotField === 'detailTexts' ? { detailTexts: values } : {}),
        ...(slotField === 'stepTexts' ? { stepTexts: values } : {}),
        explanationText: explanationText.trim(),
      };
    }
    if (keys.join(',') !== [slotField, 'choiceTexts', 'explanationText'].sort().join(',') ||
        !validSlot || !validExplanation || !validChoices) {
      throw new AiProviderError(
        'AI_CANDIDATE_SCHEMA_INVALID',
        `AI 사례 후보 계약 불일치: keys=${keys.join(',')} choiceCount=${Array.isArray(parsed.choiceTexts) ? parsed.choiceTexts.length : 'none'}`,
      );
    }
    const values = Array.isArray(parsed[slotField])
      ? parsed[slotField].map((text) => text.trim())
      : [String(parsed[slotField]).trim()];
    return {
      stemText: values.join('\n'),
      ...(slotField === 'messageTexts' ? { messageTexts: values } : {}),
      ...(slotField === 'cellTexts' ? { cellTexts: values } : {}),
      ...(slotField === 'paragraphTexts' ? { paragraphTexts: values } : {}),
      ...(slotField === 'detailTexts' ? { detailTexts: values } : {}),
      ...(slotField === 'stepTexts' ? { stepTexts: values } : {}),
      ...(slotField === 'forumTexts' ? { forumTexts: values } : {}),
      ...(slotField === 'sceneTexts' ? { sceneTexts: values } : {}),
      ...(slotField === 'promotionTexts' ? { promotionTexts: values } : {}),
      ...(slotField === 'incidentTexts' ? { incidentTexts: values } : {}),
      ...(slotField === 'reportTexts' ? { reportTexts: values } : {}),
      ...(slotField === 'numericTexts' ? { numericTexts: values } : {}),
      choiceTexts: choiceTexts.map((choice) => choice.trim()),
      explanationText: explanationText.trim(),
    };
  }
  const slotField = providerSlotField(blueprint?.template);
  if (slotField !== undefined) {
    const slotValues = parsed[slotField];
    if (
      keys.length !== 2 ||
      keys.join(',') !== [slotField, 'explanationText'].sort().join(',') ||
      !isBoundedText(parsed.explanationText, MAX_EXPLANATION_LENGTH) ||
      !isBoundedTextArray(slotValues, blueprint)
    ) {
      throw new AiProviderError(
        'AI_CANDIDATE_SCHEMA_INVALID',
        'AI 후보가 blueprint의 텍스트 슬롯 계약을 만족하지 않습니다.',
      );
    }
    const values = slotValues.map((text) => text.trim());
    return {
      stemText: values.join('\n'),
      ...(slotField === 'messageTexts' ? { messageTexts: values } : {}),
      ...(slotField === 'cellTexts' ? { cellTexts: values } : {}),
      ...(slotField === 'paragraphTexts' ? { paragraphTexts: values } : {}),
      ...(slotField === 'detailTexts' ? { detailTexts: values } : {}),
      ...(slotField === 'stepTexts' ? { stepTexts: values } : {}),
      ...(slotField === 'forumTexts' ? { forumTexts: values } : {}),
      ...(slotField === 'sceneTexts' ? { sceneTexts: values } : {}),
      ...(slotField === 'promotionTexts' ? { promotionTexts: values } : {}),
      ...(slotField === 'incidentTexts' ? { incidentTexts: values } : {}),
      ...(slotField === 'reportTexts' ? { reportTexts: values } : {}),
      ...(slotField === 'numericTexts' ? { numericTexts: values } : {}),
      explanationText: parsed.explanationText.trim(),
    };
  }
  if (
    keys.length !== 2 ||
    keys[0] !== 'explanationText' ||
    keys[1] !== 'stemText'
  ) {
    throw new AiProviderError(
      'AI_CANDIDATE_SCHEMA_INVALID',
      'AI 응답에 허용되지 않은 필드가 포함되어 있습니다.',
    );
  }
  if (
    !isBoundedText(parsed.stemText, MAX_STEM_LENGTH) ||
    !isBoundedText(parsed.explanationText, MAX_EXPLANATION_LENGTH)
  ) {
    throw new AiProviderError(
      'AI_CANDIDATE_SCHEMA_INVALID',
      'AI 후보 텍스트가 비어 있거나 허용 길이를 초과했습니다.',
    );
  }
  return {
    stemText: parsed.stemText.trim(),
    explanationText: parsed.explanationText.trim(),
  };
}

function canRecoverLegacyConversation(blueprint: AiQuestionBlueprint): boolean {
  const contract = blueprint.conversationContract;
  const lines = (blueprint.caseContext ?? '').split('\n')
    .map((line) => /^\s*([^:：]{1,20}?)\s*[:：](.+)$/u.exec(line))
    .filter((match): match is RegExpExecArray => match !== null);
  if (contract === undefined || lines.length !== contract.speakerSequence.length) return false;
  const participantIds = new Map(contract.participants.map((participant) => [participant.name, participant.id]));
  return lines.every((match, index) => participantIds.get(match[1]!.trim()) === contract.speakerSequence[index]);
}

export function aiCandidateResponseFormat(
  blueprint?: AiQuestionBlueprint,
  repair = false,
) {
  const providerChoices = supportsGeneratedChoices(blueprint);
  const slotField = providerSlotField(blueprint?.template);
  const conversation = slotField === 'messageTexts';
  const expectedSlotCount = blueprint
    ? expectedProviderSlotCount(blueprint)
    : undefined;
  const slotSchema = {
    type: 'array',
    minItems: expectedSlotCount ?? 1,
    ...(expectedSlotCount === undefined ? {} : { maxItems: expectedSlotCount }),
    items: {
      type: 'string',
      minLength: 1,
      maxLength: MAX_STEM_LENGTH,
    },
  };
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: repair
        ? 'ai_blueprint_candidate_repair'
        : conversation
          ? 'ai_conversational_candidate'
          : 'ai_blueprint_candidate',
      strict: true as const,
      schema: {
        type: 'object',
          properties: providerChoices
            ? blueprint?.template === 'TPL_CONVERSATIONAL_FLOW'
              ? {
                messageTexts: { type: 'array', minItems: expectedSlotCount ?? 1, maxItems: expectedSlotCount ?? 1, items: { type: 'string', minLength: 1, maxLength: MAX_STEM_LENGTH } },
                choiceTexts: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string', minLength: 1, maxLength: MAX_STEM_LENGTH } },
                explanationText: { type: 'string', minLength: 1, maxLength: MAX_EXPLANATION_LENGTH },
              }
              : {
                  stemText: { type: 'string', minLength: 1, maxLength: MAX_STEM_LENGTH },
                  choiceTexts: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string', minLength: 1, maxLength: MAX_STEM_LENGTH } },
                  explanationText: { type: 'string', minLength: 1, maxLength: MAX_EXPLANATION_LENGTH },
                }
            : slotField !== undefined
          ? {
              [slotField]: slotSchema,
              explanationText: {
                type: 'string',
                minLength: 1,
                maxLength: MAX_EXPLANATION_LENGTH,
              },
            }
          : {
              stemText: {
                type: 'string',
                minLength: 1,
                maxLength: MAX_STEM_LENGTH,
              },
              explanationText: {
                type: 'string',
                minLength: 1,
                maxLength: MAX_EXPLANATION_LENGTH,
              },
            },
        required: providerChoices
          ? blueprint?.template === 'TPL_CONVERSATIONAL_FLOW'
            ? ['messageTexts', 'choiceTexts', 'explanationText']
            : ['stemText', 'choiceTexts', 'explanationText']
          : slotField !== undefined
          ? [slotField, 'explanationText']
          : ['stemText', 'explanationText'],
        additionalProperties: false,
      },
    },
  };
}

function providerSlotField(
  template: string | undefined,
): ProviderSlotField | undefined {
  return template === undefined
    ? undefined
    : getTplGenerationSpec(template)?.providerSlotField;
}

function supportsGeneratedChoices(
  blueprint: AiQuestionBlueprint | undefined,
): boolean {
  if (blueprint?.sourceArchetype === undefined) return false;
  // ponytail: truth_combination choices are server-owned set combinations (ㄱㄴㄷㄹ).
  if (
    blueprint.sourceArchetype.stemIntent === 'truth_combination' ||
    blueprint.sourceArchetype.responseMode === 'truth_combination'
  ) {
    return false;
  }
  return (
    blueprint.template === 'TPL_CASE_DIAGNOSTIC_FRAME' ||
    providerSlotField(blueprint.template) !== undefined
  );
}

function isBoundedTextArray(
  value: unknown,
  blueprint: AiQuestionBlueprint | undefined,
): value is readonly string[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const expected = blueprint
    ? expectedProviderSlotCount(blueprint)
    : undefined;
  return (
    (expected === undefined || value.length === expected) &&
    value.every((text) => isBoundedText(text, MAX_STEM_LENGTH))
  );
}

function expectedProviderSlotCount(blueprint: AiQuestionBlueprint): number | undefined {
  return blueprint.providerSlotCount;
}

function isConversationMessages(
  value: unknown,
  blueprint: AiQuestionBlueprint,
): value is readonly string[] {
  const expected = blueprint.conversationContract?.speakerSequence;
  if (
    expected === undefined ||
    !Array.isArray(value) ||
    value.length !== expected.length
  )
    return false;
  return value.every((message) => isBoundedText(message, MAX_STEM_LENGTH));
}

export function aiCandidateSystemPrompt(): string {
  return [
    '당신은 한국 고등학교 교육과정 수준의 평가 문항을 작성하는 출제 전문가입니다.',
    '청사진(blueprint)이 제공되면, 원본 문항의 핵심 개념과 불변 사실을 그대로 보존하면서 새로운 줄거리(stem/사례)와 해설(explanation)을 생성하십시오.',
    '',
    '--- 품질 기준 ---',
    '1. 줄거리(stem/사례):',
    '   - 구체적이고 현실적인 사례나 자료로 구성하십시오. 추상적인 정의 나열은 피하십시오.',
    '   - 정답 개념(targetConcept)을 줄거리 속에 직접 노출하지 마십시오. 예를 들어 개념이 "직무 분석"이면 줄거리에 "직무 분석"이라는 말을 쓰지 마십시오.',
    '   - 줄거리는 선택지를 판단할 수 있는 충분한 정보를 포함해야 합니다.',
    '   - negative(옳지 않은 것) 문항일 경우, 4개의 옳은 선택지와 1개의 옳지 않은 선택지를 의도하고 줄거리를 구성하십시오.',
    '',
    '   ※ truth_combination(ㄱㄴㄷㄹ 보기형) 문항 특별 지침:',
    '   - 이 유형은 보기(ㄱ,ㄴ,ㄷ,ㄹ)의 각 조건을 사례에 비추어 참/거짓을 판단하는 문항입니다.',
    '   - 사례에는 각 보기 조건을 판단할 수 있는 구체적 수치, 기간, 나이, 예외조건 등이 반드시 포함되어야 합니다.',
    '   - invariantFacts의 각 사실이 사례에 암시적으로 녹아들어야 하며, 보기에서 "~할 수 있다/~할 수 없다" 형태로 판단 가능해야 합니다.',
    '   - 예: "A씨는 만 17세이다", "1일 6시간 근무", "수습기간 3개월" 등 구체적 조건을 사례에 포함.',
    '',
    '2. 선택지(choiceTexts, 요청된 경우에만 생성):',
    '   - 각 선택지는 완전한 문장으로, 줄거리만 보고도 판단 가능해야 합니다.',
    '   - 오답은 "그럴듯하지만 틀린" 내용이어야 합니다. 개념을 살짝 비틀거나, 유사 개념과 혼동하게 만드십시오.',
    '   - 모든 선택지는 같은 문장 구조, 비슷한 길이, 유사한 어휘 수준을 유지하십시오.',
    '   - 정답이 유독 길거나 짧으면 안 됩니다.',
    '',
    '3. 해설(explanationText):',
    '   - 정답의 근거를 명확히 서술하고, 왜 오답이 틀렸는지 간략히 설명하십시오.',
    '   - 해설에 반드시 targetConcept를 명시적으로 언급하십시오.',
    '   - 교육적 가치가 있는 해설을 작성하십시오. 단순히 "~이기 때문이다"보다는 개념의 정의와 적용 맥락을 포함하십시오.',
    '',
    '--- 금지 사항 ---',
    '- 정답 번호, 정답 선택지의 위치를 추측하거나 출력하지 마십시오. 정답은 서버가 결정합니다.',
    '- sourceFactAnchors에 명시된 원본 문항의 필수 사실(고유명사, 수치, 핵심 조건 등)을 변형하거나 누락하지 마십시오.',
    '- 실존하지 않는 출처, 통계, 법령, 연구 결과를 만들어내지 마십시오.',
    '- targetConcept를 줄거리에 그대로 노출하지 마십시오.',
    '- 줄거리 안에 질문 지시문("다음 중 옳은 것은?", "고르시오", "물음에 답하시오" 등)을 절대 포함하지 마십시오. 줄거리는 순수한 서술형 산문입니다.',
    '- "[교사]", "[학생]", "기자 :" 같은 대화 마커를 줄거리에 포함하지 마십시오. 대화형은 서버가 처리합니다.',
    '',
    '--- 난이도별 지침 ---',
    '- LOW: 단순한 상황, 명확한 구분. 한 가지 핵심 조건만 판단하면 되는 직관적 사례.',
    '- MIDDLE: 2~3가지 조건을 함께 고려해야 하는 사례. 유사 개념과의 혼동 가능성을 약간 포함.',
    '- HIGH/INTERGRATE: 여러 개념이 복합된 다단계 사례. 미묘한 차이를 구분해야 하고, 여러 단원의 지식을 통합 적용해야 함.',
  ].join('\n');
}

async function completeWithOpenAi(
  prompt: string,
  signal: AbortSignal,
  responseFormat: Parameters<AiProviderDependency['complete']>[2] =
    aiCandidateResponseFormat(),
): Promise<AiProviderCompletion> {
  const client: OpenAI = getOpenAIClient();
  const response = await client.chat.completions.create(
    {
      model: aiModelForRole(
        responseFormat.json_schema.name.includes('analysis')
          ? 'analysis'
          : responseFormat.json_schema.name.includes('repair')
            ? 'repair'
            : 'candidate',
      ),
      messages: [
        {
          role: 'system',
          content: aiCandidateSystemPrompt(),
        },
        { role: 'user', content: prompt },
      ],
      response_format: responseFormat,
      temperature: 0.2,
    },
    { signal },
  );
  return {
    content: response.choices[0]?.message.content ?? '',
    model: response.model,
    usage: response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        }
      : undefined,
  };
}

export function aiModelForRole(
  role: AiModelRole,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = environment[`OPENAI_AI_${role.toUpperCase()}_MODEL`]?.trim();
  if (configured) return configured;
  if (role === 'candidate' || role === 'repair') {
    return environment.OPENAI_AI_BLUEPRINT_MODEL?.trim() ||
      environment.OPENAI_MODEL?.trim() || 'gpt-4o';
  }
  // ponytail: analysis was hardcoded to gpt-4o-mini; now respects OPENAI_AI_ANALYSIS_MODEL
  return role === 'analysis'
    ? environment.OPENAI_AI_BLUEPRINT_MODEL?.trim() ||
      environment.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
    : 'gpt-4o';
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    value.length <= maxLength
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
