import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  getLlmClient,
  isGeminiModel,
  samplingParams,
  type ReasoningEffort,
} from '../../lib/llm-client';
import { aiModelForRole } from '../ai-provider.adapter';
import { stableHash } from '../../common/stable-hash';
import { renderForSolver, type AssembledGenerativeQuestion } from './generative-item-assembler';
import {
  blindSolveResponseFormat,
  blindSolveSystemPrompt,
  blindSolveUserPrompt,
  buildGenerativeItemPrompt,
  generativeItemResponseFormat,
  generativeSystemPrompt,
} from './generative-item-prompt';
import type {
  BlindSolveResult,
  GenerativeItemSpec,
  LlmTelemetry,
} from './generative.types';
import { parseBlindSolveResult } from './generative-gates';

export const GENERATIVE_LLM_DEPENDENCY = 'GENERATIVE_LLM_DEPENDENCY';

export type GenerativeCompletionRequest = Readonly<{
  role: 'generation' | 'verification';
  system: string;
  user: string;
  responseFormat: Readonly<{ type: 'json_schema'; json_schema: Readonly<{ name: string; strict: boolean; schema: unknown }> }>;
  /** 추론 강도(출력 토큰 = 비용의 대부분). 없으면 역할 기본값 */
  reasoningEffort?: ReasoningEffort;
  signal: AbortSignal;
}>;

export type GenerativeCompletion = Readonly<{
  content: string;
  model: string;
  usage?: Readonly<{ promptTokens?: number; completionTokens?: number; totalTokens?: number }>;
}>;

/** 테스트에서 주입할 수 있는 최소 의존성. 기본값은 Gemini/OpenAI 호환 호출. */
export type GenerativeLlmDependency = Readonly<{
  complete: (request: GenerativeCompletionRequest) => Promise<GenerativeCompletion>;
}>;

export class GenerativeProviderError extends Error {
  readonly name = 'GenerativeProviderError';
  constructor(readonly code: 'GEN_PROVIDER_ERROR' | 'GEN_PROVIDER_TIMEOUT' | 'GEN_CANCELED', message: string) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 150_000;

@Injectable()
export class GenerativeLlmClient {
  private readonly dependency: GenerativeLlmDependency;
  private readonly timeoutMs: number;

  constructor(
    @Optional()
    @Inject(GENERATIVE_LLM_DEPENDENCY)
    dependency?: GenerativeLlmDependency,
  ) {
    this.dependency = dependency ?? { complete: completeWithProvider };
    this.timeoutMs = Number(process.env.AI_GENERATIVE_PROVIDER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  }

  async generateItem(
    spec: GenerativeItemSpec,
    repairNotes: readonly string[],
    signal?: AbortSignal,
  ): Promise<Readonly<{ content: string; promptHash: string; telemetry: LlmTelemetry }>> {
    const user = buildGenerativeItemPrompt(spec, repairNotes);
    const result = await this.call({
      role: 'generation',
      system: generativeSystemPrompt(),
      user,
      responseFormat: generativeItemResponseFormat(spec),
      reasoningEffort: generationReasoningEffort(spec),
    }, signal);
    return { content: result.content, promptHash: stableHash(user), telemetry: result.telemetry };
  }

  async blindSolve(
    question: AssembledGenerativeQuestion,
    signal?: AbortSignal,
    legalRules: readonly string[] = [],
  ): Promise<Readonly<{ result: BlindSolveResult; telemetry: LlmTelemetry }>> {
    const { content, telemetry } = await this.call({
      role: 'verification',
      system: blindSolveSystemPrompt(),
      user: blindSolveUserPrompt(renderForSolver(question), legalRules),
      responseFormat: blindSolveResponseFormat(),
      reasoningEffort: verificationReasoningEffort(question.points),
    }, signal);
    return { result: parseBlindSolve(content), telemetry };
  }

  private async call(
    request: Omit<GenerativeCompletionRequest, 'signal'>,
    externalSignal?: AbortSignal,
  ): Promise<Readonly<{ content: string; telemetry: LlmTelemetry }>> {
    const retries = providerRetries();
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.callOnce(request, externalSignal);
      } catch (error: unknown) {
        const status = providerStatus(error);
        const transient = status === 429 || (status !== undefined && status >= 500);
        if (!transient || attempt >= retries || externalSignal?.aborted === true) {
          throw toProviderError(error, externalSignal);
        }
        // 429/5xx: 지수 백오프(2s, 4s, 8s, …) + 지터
        await sleep(2_000 * 2 ** attempt + Math.floor(Math.random() * 1_000), externalSignal);
      }
    }
  }

  private async callOnce(
    request: Omit<GenerativeCompletionRequest, 'signal'>,
    externalSignal?: AbortSignal,
  ): Promise<Readonly<{ content: string; telemetry: LlmTelemetry }>> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    externalSignal?.addEventListener('abort', abort, { once: true });
    if (externalSignal?.aborted) controller.abort();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const startedAt = Date.now();
    try {
      const completion = await this.dependency.complete({ ...request, signal: controller.signal });
      return {
        content: completion.content,
        telemetry: {
          model: completion.model,
          latencyMs: Date.now() - startedAt,
          ...completion.usage,
        },
      };
    } catch (error: unknown) {
      if (timedOut) {
        throw new GenerativeProviderError(
          'GEN_PROVIDER_TIMEOUT',
          `AI 호출이 ${Math.round(this.timeoutMs / 1000)}초 안에 끝나지 않았습니다.`,
        );
      }
      if (externalSignal?.aborted === true) {
        throw new GenerativeProviderError('GEN_CANCELED', '작업이 취소되어 AI 호출을 중단했습니다.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abort);
    }
  }
}

function providerRetries(): number {
  const configured = Number(process.env.AI_GENERATIVE_PROVIDER_RETRIES);
  return Number.isInteger(configured) && configured >= 0 ? Math.min(configured, 8) : 4;
}

function providerStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  const status = Number((error as { status: unknown }).status);
  return Number.isFinite(status) ? status : undefined;
}

function toProviderError(error: unknown, signal?: AbortSignal): GenerativeProviderError {
  if (error instanceof GenerativeProviderError) return error;
  if (signal?.aborted === true) {
    return new GenerativeProviderError('GEN_CANCELED', '작업이 취소되어 AI 호출을 중단했습니다.');
  }
  const detail = error instanceof Error ? error.message.slice(0, 200) : 'unknown';
  return new GenerativeProviderError('GEN_PROVIDER_ERROR', `AI 문항 생성 호출 실패: ${detail}`);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export const DEFAULT_CROSS_VERIFICATION_MODELS = {
  openai: 'gpt-4.1',
  gemini: 'gemini-3.8-flash',
} as const;

/**
 * 검토(블라인드 풀이)는 기본적으로 출제 모델과 다른 계열을 쓴다(같은 모델은 자기 실수에 관대하다).
 * AI_VERIFICATION_MODEL을 주면 그대로 쓰고, 상대 계열 키가 없으면 출제 모델로 대체한다.
 */
export function generativeModelForRole(
  role: GenerativeCompletionRequest['role'],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const generation = aiModelForRole('candidate', environment);
  if (role === 'generation') return generation;
  const explicit = environment.AI_VERIFICATION_MODEL?.trim();
  if (explicit) return explicit;
  if (isGeminiModel(generation)) {
    return environment.OPENAI_API_KEY?.trim()
      ? environment.AI_CROSS_VERIFICATION_OPENAI_MODEL?.trim() || DEFAULT_CROSS_VERIFICATION_MODELS.openai
      : generation;
  }
  return environment.GEMINI_API_KEY?.trim()
    ? environment.AI_CROSS_VERIFICATION_GEMINI_MODEL?.trim() || DEFAULT_CROSS_VERIFICATION_MODELS.gemini
    : generation;
}

function parseEffort(value: string | undefined): ReasoningEffort | undefined {
  const configured = value?.trim().toLowerCase();
  return configured === 'low' || configured === 'medium' || configured === 'high' ? configured : undefined;
}

/**
 * 출제 추론 강도. 비용 대부분이 추론 토큰이라 배점에 맞춘다:
 * 2점 기본 문항 low, 3점 문항 medium(계산 문항의 수치·참거짓은 서버가 확정하므로 따로 올리지 않는다).
 * AI_GENERATION_REASONING_EFFORT로 모든 문항을 고정할 수 있다.
 */
export function generationReasoningEffort(
  spec: Pick<GenerativeItemSpec, 'points'>,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ReasoningEffort {
  return parseEffort(environment.AI_GENERATION_REASONING_EFFORT) ?? (spec.points === 3 ? 'medium' : 'low');
}

/**
 * 검토(정답 모르는 풀이) 추론 강도: 2점 medium, 3점 high. 오답 문항을 거르는 마지막 관문이라 출제보다 한 단계 높다.
 * AI_VERIFICATION_REASONING_EFFORT로 고정할 수 있다.
 */
export function verificationReasoningEffort(
  points: 2 | 3,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ReasoningEffort {
  return parseEffort(environment.AI_VERIFICATION_REASONING_EFFORT) ?? (points === 3 ? 'high' : 'medium');
}

async function completeWithProvider(
  request: GenerativeCompletionRequest,
): Promise<GenerativeCompletion> {
  const model = generativeModelForRole(request.role);
  const response = await getLlmClient(model).chat.completions.create(
    {
      model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      response_format: request.responseFormat as never,
      ...samplingParams(model, {
        temperature: request.role === 'generation' ? 0.8 : 0,
        reasoningEffort: request.reasoningEffort ?? (request.role === 'generation' ? 'low' : 'medium'),
      }),
    },
    { signal: request.signal },
  );
  return {
    content: response.choices[0]?.message.content ?? '',
    model: response.model || model,
    usage: response.usage === undefined
      ? undefined
      : {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        },
  };
}

export function parseBlindSolve(content: string): BlindSolveResult {
  try {
    return parseBlindSolveResult(content);
  } catch (error) {
    throw new GenerativeProviderError('GEN_PROVIDER_ERROR', error instanceof Error ? error.message : String(error));
  }
}
