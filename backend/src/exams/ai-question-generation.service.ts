import { Inject, Injectable } from '@nestjs/common';
import type {
  AiGenerationFailureCode,
  AiGenerationValidationResult,
  AiQuestionBlueprint,
  AiQuestionCandidate,
} from './ai-blueprint.types';
import type { ExamGenerationProgressReporter } from './exam-generation.utils';
import { AiProviderError, AiProviderAdapter } from './ai-provider.adapter';
import {
  materializeAiQuestion,
  type AiMaterializedQuestion,
} from './ai-question-materializer';
import {
  validateAiQuestion,
  AI_QUESTION_VALIDATOR_VERSION,
} from './ai-question-validator';
import { stableHash } from './reference-selector.utils';

export const AI_MAX_CANDIDATE_ATTEMPTS = 3;
export const AI_QUESTION_CANDIDATE_PROVIDER = 'AI_QUESTION_CANDIDATE_PROVIDER';

export type AiQuestionCandidateProvider = Readonly<{
  generate: AiProviderAdapter['generate'];
}>;

export type AiAcceptedQuestion = Readonly<{
  blueprint: AiQuestionBlueprint;
  candidate: AiQuestionCandidate;
  question: AiMaterializedQuestion;
  validation: AiGenerationValidationResult;
  fingerprint: string;
  attempt: number;
}>;

export type AiRejectedCandidate = Readonly<{
  blueprintId: string;
  attempt: number;
  code: AiGenerationFailureCode;
  message?: string;
}>;

export type AiQuestionGenerationResult = Readonly<{
  requestedCount: number;
  accepted: readonly AiAcceptedQuestion[];
  rejected: readonly AiRejectedCandidate[];
  shortfall?: Readonly<{
    requestedCount: number;
    generatedCount: number;
    reason: 'AI_RETRY_EXHAUSTED' | 'AI_BLUEPRINT_SHORTFALL';
  }>;
}>;

@Injectable()
export class AiQuestionGenerationService {
  constructor(
    @Inject(AI_QUESTION_CANDIDATE_PROVIDER)
    private readonly provider: AiQuestionCandidateProvider,
  ) {}

  async generate(
    blueprints: readonly AiQuestionBlueprint[],
    reportProgress?: ExamGenerationProgressReporter,
  ): Promise<AiQuestionGenerationResult> {
    const accepted: AiAcceptedQuestion[] = [];
    const rejected: AiRejectedCandidate[] = [];
    const fingerprints = new Set<string>();
    const structuralFingerprints = new Set<string>();
    const total = blueprints.length;

    for (const [index, blueprint] of blueprints.entries()) {
      let admitted: AiAcceptedQuestion | undefined;
      for (
        let attempt = 1;
        attempt <= AI_MAX_CANDIDATE_ATTEMPTS;
        attempt += 1
      ) {
        await reportProgress?.({
          stage: 'candidate',
          progress: Math.round((index / Math.max(1, total)) * 80),
          message: 'AI 후보 문항을 생성하고 있습니다.',
          completed: index,
          total,
          attempt,
          maxAttempts: AI_MAX_CANDIDATE_ATTEMPTS,
          aiProgress: {
            stage: 'candidate',
            completed: index,
            total,
            attempt,
            maxAttempts: AI_MAX_CANDIDATE_ATTEMPTS,
            accepted: accepted.length,
            rejected: rejected.length,
          },
        });
        try {
          const candidate = await this.provider.generate(blueprint, attempt);
          const materialized = materializeAiQuestion(blueprint, candidate);
          if (materialized.kind === 'rejected') {
            rejected.push({
              blueprintId: blueprint.id,
              attempt,
              code: materialized.code,
              message: materialized.message,
            });
            continue;
          }
          const validation = validateAiQuestion(
            blueprint,
            candidate,
            materialized.question,
          );
          if (!validation.passed) {
            rejected.push({
              blueprintId: blueprint.id,
              attempt,
              code: validation.failureCode ?? 'AI_INVARIANT_MISMATCH',
            });
            continue;
          }
          const fingerprint = aiQuestionFingerprint(materialized.question);
          const structuralFingerprint = aiQuestionStructuralFingerprint(
            blueprint,
            candidate,
          );
          if (fingerprints.has(fingerprint)) {
            rejected.push({
              blueprintId: blueprint.id,
              attempt,
              code: 'AI_DUPLICATE_REJECTED',
            });
            continue;
          }
          if (structuralFingerprints.has(structuralFingerprint)) {
            rejected.push({
              blueprintId: blueprint.id,
              attempt,
              code: 'AI_DUPLICATE_REJECTED',
            });
            continue;
          }
          admitted = {
            blueprint,
            candidate,
            question: materialized.question,
            validation: {
              ...validation,
              validatorVersion: AI_QUESTION_VALIDATOR_VERSION,
            },
            fingerprint,
            attempt,
          };
          break;
        } catch (error: unknown) {
          const code =
            error instanceof AiProviderError
              ? error.code
              : 'AI_PROVIDER_MALFORMED_OUTPUT';
          rejected.push({
            blueprintId: blueprint.id,
            attempt,
            code,
            message: error instanceof Error ? error.message : undefined,
          });
        }
      }
      if (admitted !== undefined) {
        accepted.push(admitted);
        fingerprints.add(admitted.fingerprint);
        structuralFingerprints.add(
          aiQuestionStructuralFingerprint(
            admitted.blueprint,
            admitted.candidate,
          ),
        );
      }
      await reportProgress?.({
        stage: 'validation',
        progress: Math.round(((index + 1) / Math.max(1, total)) * 95),
        message: 'AI 후보 문항을 검증했습니다.',
        completed: index + 1,
        total,
        attempt: admitted?.attempt ?? AI_MAX_CANDIDATE_ATTEMPTS,
        maxAttempts: AI_MAX_CANDIDATE_ATTEMPTS,
        aiProgress: {
          stage: 'validation',
          completed: index + 1,
          total,
          attempt: admitted?.attempt ?? AI_MAX_CANDIDATE_ATTEMPTS,
          maxAttempts: AI_MAX_CANDIDATE_ATTEMPTS,
          accepted: accepted.length,
          rejected: rejected.length,
        },
      });
    }

    return {
      requestedCount: total,
      accepted,
      rejected,
      ...(accepted.length === total
        ? {}
        : {
            shortfall: {
              requestedCount: total,
              generatedCount: accepted.length,
              reason: 'AI_RETRY_EXHAUSTED',
            },
          }),
    };
  }
}

export function aiQuestionFingerprint(
  question: AiMaterializedQuestion,
): string {
  return `ai:${stableHash(
    JSON.stringify({
      stem: question.questionStem,
      stimulus: question.stimulusData,
      options: question.optionsList,
      answer: question.correctAnswer,
    }),
  )}`;
}

export function aiQuestionStructuralFingerprint(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
): string {
  return `ai-structural:${stableHash(
    JSON.stringify({
      template: blueprint.template,
      targetConcept: blueprint.targetConcept,
      polarity: blueprint.sourceArchetype?.polarity ?? 'positive',
      narrative: candidate.stemText
        .normalize('NFKC')
        .replace(/\s+/gu, ' ')
        .trim(),
    }),
  )}`;
}
