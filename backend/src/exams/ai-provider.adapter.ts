import { Inject, Injectable, Optional } from '@nestjs/common';
import type OpenAI from 'openai';
import { getOpenAIClient } from '../lib/openai-keys';
import {
  AI_BLUEPRINT_CONTRACT_VERSION,
  type AiGenerationFailureCode,
  type AiProviderTelemetry,
  type AiQuestionBlueprint,
  type AiQuestionCandidate,
} from './ai-blueprint.types';
import { stableHash } from './reference-selector.utils';

export const AI_BLUEPRINT_PROVIDER = 'AI_BLUEPRINT_PROVIDER';
export const AI_BLUEPRINT_PROMPT_VERSION = 'v2' as const;
export const AI_BLUEPRINT_VALIDATOR_VERSION = 'v2' as const;

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_STEM_LENGTH = 700;
const MAX_EXPLANATION_LENGTH = 1_500;

export type AiProviderDependency = Readonly<{
  complete: (
    prompt: string,
    signal: AbortSignal,
    responseFormat?: ReturnType<typeof aiCandidateResponseFormat>,
  ) => Promise<string | AiProviderCompletion>;
}>;

type AiProviderCompletion = Readonly<{
  content: string;
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
      complete: (prompt, signal) => completeWithOpenAi(prompt, signal),
    };
    this.timeoutMs =
      Number(process.env.AI_BLUEPRINT_PROVIDER_TIMEOUT_MS) ||
      DEFAULT_TIMEOUT_MS;
  }

  async generate(
    blueprint: AiQuestionBlueprint,
    attempt: number,
  ): Promise<AiQuestionCandidate> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const prompt = buildAiCandidatePrompt(blueprint, attempt);
      const completion =
        blueprint.template === 'TPL_CONVERSATIONAL_FLOW'
          ? await this.dependency.complete(
              prompt,
              controller.signal,
              aiCandidateResponseFormat(blueprint),
            )
          : await this.dependency.complete(prompt, controller.signal);
      const content =
        typeof completion === 'string' ? completion : completion.content;
      const candidate = parseAiQuestionCandidate(content, blueprint);
      const model =
        process.env.OPENAI_AI_BLUEPRINT_MODEL ??
        process.env.OPENAI_MODEL ??
        'gpt-4o';
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
    }
  }
}

export function buildAiCandidatePrompt(
  blueprint: AiQuestionBlueprint,
  attempt: number,
): string {
  return JSON.stringify({
    task: 'Write bounded prose for one question blueprint.',
    contractVersion: AI_BLUEPRINT_CONTRACT_VERSION,
    promptVersion: AI_BLUEPRINT_PROMPT_VERSION,
    attempt,
    outputRules: [
      blueprint.template === 'TPL_CONVERSATIONAL_FLOW'
        ? 'Return exactly one JSON object with exactly messages and explanationText.'
        : 'Return exactly one JSON object with exactly stemText and explanationText.',
      'Do not return choices, answer numbers, stimulus data, metadata, or lineage.',
      'Use only the blueprint concept, invariants, and permitted slots.',
      'Do not invent source facts, official answers, numbers, tables, or diagrams.',
      blueprint.template === 'TPL_CONVERSATIONAL_FLOW'
        ? `Keep every message text at most ${MAX_STEM_LENGTH} characters.`
        : `Keep stemText at most ${MAX_STEM_LENGTH} characters.`,
      `Keep explanationText at most ${MAX_EXPLANATION_LENGTH} characters.`,
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
  if (blueprint?.template === 'TPL_CONVERSATIONAL_FLOW') {
    if (
      keys.length !== 2 ||
      keys[0] !== 'explanationText' ||
      keys[1] !== 'messages' ||
      !isBoundedText(parsed.explanationText, MAX_EXPLANATION_LENGTH) ||
      !isConversationMessages(parsed.messages, blueprint)
    ) {
      throw new AiProviderError(
        'AI_CANDIDATE_SCHEMA_INVALID',
        'AI 대화 후보가 blueprint의 발화자/순서 계약을 만족하지 않습니다.',
      );
    }
    const messages = parsed.messages.map((message) => ({
      speakerId: message.speakerId,
      text: message.text.trim(),
    }));
    return {
      stemText: messages.map((message) => message.text).join('\n'),
      messages,
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

export function aiCandidateResponseFormat(blueprint?: AiQuestionBlueprint) {
  const conversation = blueprint?.template === 'TPL_CONVERSATIONAL_FLOW';
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: conversation
        ? 'ai_conversational_candidate'
        : 'ai_blueprint_candidate',
      strict: true as const,
      schema: {
        type: 'object',
        properties: conversation
          ? {
              messages: {
                type: 'array',
                minItems:
                  blueprint?.conversationContract?.speakerSequence.length ?? 1,
                maxItems:
                  blueprint?.conversationContract?.speakerSequence.length ?? 1,
                items: {
                  type: 'object',
                  properties: {
                    speakerId: {
                      type: 'string',
                      enum: (
                        blueprint?.conversationContract?.participants ?? []
                      ).map((participant) => participant.id),
                    },
                    text: {
                      type: 'string',
                      minLength: 1,
                      maxLength: MAX_STEM_LENGTH,
                    },
                  },
                  required: ['speakerId', 'text'],
                  additionalProperties: false,
                },
              },
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
        required: conversation
          ? ['messages', 'explanationText']
          : ['stemText', 'explanationText'],
        additionalProperties: false,
      },
    },
  };
}

function isConversationMessages(
  value: unknown,
  blueprint: AiQuestionBlueprint,
): value is readonly { speakerId: string; text: string }[] {
  const expected = blueprint.conversationContract?.speakerSequence;
  if (
    expected === undefined ||
    !Array.isArray(value) ||
    value.length !== expected.length
  )
    return false;
  return value.every((message, index) => {
    if (!isRecord(message)) return false;
    return (
      message.speakerId === expected[index] &&
      isBoundedText(message.text, MAX_STEM_LENGTH)
    );
  });
}

async function completeWithOpenAi(
  prompt: string,
  signal: AbortSignal,
  responseFormat = aiCandidateResponseFormat(),
): Promise<AiProviderCompletion> {
  const client: OpenAI = getOpenAIClient();
  const response = await client.chat.completions.create(
    {
      model:
        process.env.OPENAI_AI_BLUEPRINT_MODEL ??
        process.env.OPENAI_MODEL ??
        'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'Write only the minimal JSON candidate requested by the blueprint. Never choose an answer or create choices.',
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
    usage: response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        }
      : undefined,
  };
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
