import OpenAI from 'openai';
import { getOpenAIClient } from './openai-keys';

/**
 * OpenAI SDK 하나로 OpenAI와 Gemini(OpenAI 호환 엔드포인트)를 함께 부른다.
 * 모델 이름이 `gemini-`로 시작하면 GEMINI_API_KEY로 Google 엔드포인트를 쓴다.
 */
export const GEMINI_OPENAI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/';

export type ReasoningEffort = 'low' | 'medium' | 'high';

let geminiClients: OpenAI[] | null = null;
let geminiIndex = 0;

export function isGeminiModel(model: string): boolean {
  return model.trim().toLowerCase().startsWith('gemini-');
}

function loadGeminiClients(): OpenAI[] {
  if (geminiClients === null) {
    const keys: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const key =
        i === 1 ? process.env.GEMINI_API_KEY : process.env[`GEMINI_API_KEY${i}`];
      if (key !== undefined && key.trim() !== '') keys.push(key.trim());
    }
    geminiClients = keys.map(
      (apiKey) => new OpenAI({ apiKey, baseURL: GEMINI_OPENAI_BASE_URL }),
    );
  }
  return geminiClients;
}

export function getLlmClient(model: string): OpenAI {
  if (!isGeminiModel(model)) return getOpenAIClient();
  const all = loadGeminiClients();
  if (all.length === 0) {
    throw new Error(`GEMINI_API_KEY가 설정되지 않았습니다. (model=${model})`);
  }
  const client = all[geminiIndex % all.length];
  geminiIndex++;
  return client;
}

/** OpenAI 추론 모델(o-시리즈, gpt-5 계열)은 temperature를 받지 않는다. */
export function isOpenAiReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/u.test(model.trim().toLowerCase());
}

/**
 * 모델별 샘플링 파라미터.
 * Gemini 3.x는 temperature 등 샘플링 파라미터가 deprecated이고 thinking을 끌 수 없으므로
 * temperature를 보내지 않고 reasoning_effort(thinking_level)로만 조절한다.
 */
export function samplingParams(
  model: string,
  options: Readonly<{ temperature?: number; reasoningEffort?: ReasoningEffort }>,
): Readonly<{ temperature?: number; reasoning_effort?: ReasoningEffort }> {
  if (isGeminiModel(model) || isOpenAiReasoningModel(model)) {
    return options.reasoningEffort === undefined
      ? {}
      : { reasoning_effort: options.reasoningEffort };
  }
  return options.temperature === undefined
    ? {}
    : { temperature: options.temperature };
}

export function geminiReasoningEffort(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  fallback: ReasoningEffort = 'medium',
): ReasoningEffort {
  const configured = environment.GEMINI_REASONING_EFFORT?.trim().toLowerCase();
  return configured === 'low' || configured === 'medium' || configured === 'high'
    ? configured
    : fallback;
}
