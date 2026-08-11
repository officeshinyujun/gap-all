import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type {
  AiGenerationFailureCode,
  AiGenerationValidationResult,
  AiCandidateRepairContext,
  AiQuestionBlueprint,
  AiQuestionCandidate,
} from './ai-blueprint.types';
import type { ExamGenerationProgressReporter } from './exam-generation.utils';
import { AiProviderError, AiProviderAdapter } from './ai-provider.adapter';
import {
  materializeAiQuestion,
  materializeSourcePreservingFallback,
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
  verifyChoices?: AiProviderAdapter['verifyChoices'];
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
  template: string;
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
    rejectionsByCode?: Readonly<Record<string, number>>;
  }>;
  rejectionsByTemplate?: Readonly<Record<string, number>>;
  rejectionsByCode?: Readonly<Record<string, number>>;
}>;

@Injectable()
export class AiQuestionGenerationService {
  private readonly logger = new Logger(AiQuestionGenerationService.name);

  constructor(
    @Inject(AI_QUESTION_CANDIDATE_PROVIDER)
    private readonly provider: AiQuestionCandidateProvider,
  ) {}

  async generate(
    blueprints: readonly AiQuestionBlueprint[],
    reportProgress?: ExamGenerationProgressReporter,
    requestedCount = blueprints.length,
    deadlineAtMs?: number,
    shouldCancel?: () => boolean,
    abortSignal?: AbortSignal,
    previousFingerprints: readonly string[] = [],
    previousStructuralFingerprints: readonly string[] = [],
  ): Promise<AiQuestionGenerationResult> {
    const accepted: AiAcceptedQuestion[] = [];
    const rejected: AiRejectedCandidate[] = [];
    const fingerprints = new Set(previousFingerprints);
    const structuralFingerprints = new Set(previousStructuralFingerprints);
    const total = blueprints.length;

    for (const [index, blueprint] of blueprints.entries()) {
      if (shouldCancel?.()) {
        throw new InternalServerErrorException({
          code: 'AI_JOB_CANCELED',
          message: 'AI 시험 생성 작업이 취소되었습니다.',
        });
      }
      if (deadlineAtMs !== undefined && Date.now() >= deadlineAtMs) {
        throw new InternalServerErrorException({
          code: 'AI_JOB_TIMEOUT',
          message: 'AI 시험 생성 시간이 초과되었습니다.',
        });
      }
      let admitted: AiAcceptedQuestion | undefined;
      let repair: AiCandidateRepairContext | undefined;
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
          const candidate = await this.provider.generate(
            blueprint,
            attempt,
            abortSignal,
            repair,
          );
          const materialized = materializeAiQuestion(blueprint, candidate);
          if (materialized.kind === 'rejected') {
            this.logger.warn(
              `AI candidate rejected before validation: blueprint=${blueprint.id} attempt=${attempt} code=${materialized.code} message=${materialized.message}`,
            );
            rejected.push({
              blueprintId: blueprint.id,
              template: blueprint.template,
              attempt,
              code: materialized.code,
              message: materialized.message,
            });
            repair = {
              failureReason: materialized.message,
              requiredAnchors: blueprint.sourceFactAnchors ?? [],
            };
            continue;
          }
          if (candidate.choiceTexts !== undefined) {
            const verification = await this.provider.verifyChoices?.(
              blueprint,
              candidate,
              abortSignal,
            );
            if (verification === undefined) {
              // Generated choices are never admitted without the semantic gate.
              // Fall back to the server-owned answer engine for custom providers.
              rejected.push({
                blueprintId: blueprint.id,
                template: blueprint.template,
                attempt,
                code: 'AI_ANSWER_RULE_MISMATCH',
                message: 'generated choices require semantic verification',
              });
              const serverChoiceCandidate = { ...candidate, choiceTexts: undefined };
              const serverChoiceMaterialized = materializeAiQuestion(
                blueprint,
                serverChoiceCandidate,
              );
              if (serverChoiceMaterialized.kind === 'accepted') {
                const serverChoiceValidation = validateAiQuestion(
                  blueprint,
                  serverChoiceCandidate,
                  serverChoiceMaterialized.question,
                );
                if (serverChoiceValidation.passed) {
                  admitted = {
                    blueprint,
                    candidate: serverChoiceCandidate,
                    question: serverChoiceMaterialized.question,
                    validation: serverChoiceValidation,
                    fingerprint: aiQuestionFingerprint(serverChoiceMaterialized.question),
                    attempt,
                  };
                  break;
                }
              }
              continue;
            }
            if (verification !== undefined &&
              !verification.passed ||
              (verification !== undefined && verification.answerIndex !== blueprint.answerIndex) ||
              (verification !== undefined && verification.choices.length !== 5) ||
              (verification !== undefined && verification.choices.filter((choice) => choice.correct).length !== 1) ||
              (verification !== undefined && !verification.choices.every((choice) =>
                choice.correct === (choice.index === blueprint.answerIndex),
              ))) {
              const message = 'semantic choice verification failed';
              rejected.push({
                blueprintId: blueprint.id,
                template: blueprint.template,
                attempt,
                code: 'AI_ANSWER_RULE_MISMATCH',
                message,
              });
              repair = {
                failureReason: message,
                requiredAnchors: blueprint.sourceFactAnchors ?? [],
              };
              continue;
            }
          }
          const validation = validateAiQuestion(
            blueprint,
            candidate,
            materialized.question,
          );
          if (!validation.passed) {
            this.logger.warn(
              `AI candidate failed validation: blueprint=${blueprint.id} attempt=${attempt} code=${validation.failureCode ?? 'unknown'}`,
            );
            rejected.push({
              blueprintId: blueprint.id,
              template: blueprint.template,
              attempt,
              code: validation.failureCode ?? 'AI_INVARIANT_MISMATCH',
              message: validation.message,
            });
            repair = {
              failureReason:
                validation.message ?? validation.failureCode ?? 'candidate validation failed',
              requiredAnchors: blueprint.sourceFactAnchors ?? [],
            };
            if (
              candidate.choiceTexts !== undefined &&
              (validation.failureCode === 'AI_ANSWER_RULE_MISMATCH' ||
                validation.failureCode === 'AI_DISTRACTOR_INVALID')
            ) {
              // The provider's prose choices are optional; the server's answer
              // engine is authoritative. Keep the valid stimulus and rebuild choices.
              const serverChoiceCandidate = { ...candidate, choiceTexts: undefined };
              const serverChoiceMaterialized = materializeAiQuestion(
                blueprint,
                serverChoiceCandidate,
              );
              if (serverChoiceMaterialized.kind === 'accepted') {
                const serverChoiceValidation = validateAiQuestion(
                  blueprint,
                  serverChoiceCandidate,
                  serverChoiceMaterialized.question,
                );
                if (serverChoiceValidation.passed) {
                  admitted = {
                    blueprint,
                    candidate: serverChoiceCandidate,
                    question: serverChoiceMaterialized.question,
                    validation: serverChoiceValidation,
                    fingerprint: aiQuestionFingerprint(serverChoiceMaterialized.question),
                    attempt,
                  };
                  break;
                }
              }
            }
            if (
              attempt === AI_MAX_CANDIDATE_ATTEMPTS &&
              validation.failureCode === 'AI_INVARIANT_MISMATCH' &&
              validation.message?.startsWith('source fact anchor missing')
            ) {
              const fallback = materializeSourcePreservingFallback(blueprint, candidate);
              if (fallback.kind === 'accepted') {
                const fallbackCandidate = {
                  ...candidate,
                  stemText: blueprint.caseContext ?? candidate.stemText,
                  choiceTexts: undefined,
                };
                const fallbackValidation = validateAiQuestion(
                  blueprint,
                  fallbackCandidate,
                  fallback.question,
                );
                if (fallbackValidation.passed) {
                  admitted = {
                    blueprint,
                    candidate: fallbackCandidate,
                    question: fallback.question,
                    validation: fallbackValidation,
                    fingerprint: aiQuestionFingerprint(fallback.question),
                    attempt,
                  };
                }
              }
            }
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
              template: blueprint.template,
              attempt,
              code: 'AI_DUPLICATE_REJECTED',
            });
            continue;
          }
          if (structuralFingerprints.has(structuralFingerprint)) {
            rejected.push({
              blueprintId: blueprint.id,
              template: blueprint.template,
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
            template: blueprint.template,
            attempt,
            code,
            message: error instanceof Error ? error.message : undefined,
          });
          this.logger.warn(
            `AI provider candidate failed: blueprint=${blueprint.id} attempt=${attempt} code=${code} message=${error instanceof Error ? error.message : 'unknown'}`,
          );
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
      if (accepted.length >= requestedCount) break;
    }

    const rejectionsByTemplate: Record<string, number> = {};
    const rejectionsByCode: Record<string, number> = {};
    for (const rejection of rejected) {
      rejectionsByTemplate[rejection.template] =
        (rejectionsByTemplate[rejection.template] ?? 0) + 1;
      rejectionsByCode[rejection.code] = (rejectionsByCode[rejection.code] ?? 0) + 1;
    }
    return {
      requestedCount,
      accepted,
      rejected,
      ...(accepted.length >= requestedCount
        ? {}
        : {
            shortfall: {
              requestedCount,
            generatedCount: accepted.length,
            reason: 'AI_RETRY_EXHAUSTED',
            rejectionsByCode,
            },
          }),
      ...(Object.keys(rejectionsByTemplate).length > 0
        ? { rejectionsByTemplate }
        : {}),
      ...(Object.keys(rejectionsByCode).length > 0 ? { rejectionsByCode } : {}),
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
