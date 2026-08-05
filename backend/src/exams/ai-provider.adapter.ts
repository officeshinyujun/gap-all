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
       slotField !== undefined
         ? `Keep every ${slotField} item at most ${MAX_STEM_LENGTH} characters.`
        : `Keep stemText at most ${MAX_STEM_LENGTH} characters.`,
      `Keep explanationText at most ${MAX_EXPLANATION_LENGTH} characters.`,
      providerChoices
        ? 'Example shape: {"stemText":"사례 서술","choiceTexts":["판단문1","판단문2","판단문3","판단문4","판단문5"],"explanationText":"정답 근거"}.'
        : '',
    ],
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
              'The backend owns the template, choices, answer, and stimulus DTO.',
              'Write only a source-grounded narrative that does not reveal the target concept.',
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
  return blueprint?.sourceArchetype !== undefined &&
    (blueprint.template === 'TPL_CASE_DIAGNOSTIC_FRAME' ||
      providerSlotField(blueprint.template) !== undefined);
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
          content:
            'Return only the strict JSON object requested. Preserve source-grounded facts and never invent official answers.',
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
  return role === 'analysis' ? 'gpt-4o-mini' : 'gpt-4o';
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
