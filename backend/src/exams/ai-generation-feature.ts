import { BadRequestException } from '@nestjs/common';
import {
  AI_BLUEPRINT_GENERATION_ENV,
  type AiGenerationFailureCode,
} from './ai-blueprint.types';
import type { AiQuestionFamily } from './ai-blueprint.types';

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function isAiBlueprintGenerationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return ENABLED_VALUES.has(
    (env[AI_BLUEPRINT_GENERATION_ENV] ?? '').trim().toLowerCase(),
  );
}

export function assertAiBlueprintGenerationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (isAiBlueprintGenerationEnabled(env)) return;

  const code: AiGenerationFailureCode = 'AI_FEATURE_DISABLED';
  throw new BadRequestException({
    code,
    message: 'AI 기반 신규 문항 생성은 아직 활성화되지 않았습니다.',
  });
}

const FAMILY_ENV: Readonly<Record<AiQuestionFamily, string>> = {
  concept: 'ENABLE_AI_BLUEPRINT_CONCEPT',
  case: 'ENABLE_AI_BLUEPRINT_CASE',
  calculation: 'ENABLE_AI_BLUEPRINT_CALCULATION',
};

export function isAiQuestionFamilyEnabled(
  family: AiQuestionFamily,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isAiBlueprintGenerationEnabled(env)) return false;
  const override = env[FAMILY_ENV[family]];
  return override === undefined
    ? family === 'case'
    : ENABLED_VALUES.has(override.trim().toLowerCase());
}

export function assertAiQuestionFamilyEnabled(
  family: AiQuestionFamily,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (isAiQuestionFamilyEnabled(family, env)) return;
  throw new BadRequestException({
    code: 'AI_UNSUPPORTED_FAMILY' satisfies AiGenerationFailureCode,
    message: `AI ${family} 문항 유형은 현재 활성화되지 않았습니다.`,
  });
}

export function isAiSubjectEnabled(
  subjectSlug: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const configured = env.ENABLE_AI_BLUEPRINT_SUBJECTS?.trim();
  if (configured === undefined || configured === '') return true;
  return configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(subjectSlug);
}
