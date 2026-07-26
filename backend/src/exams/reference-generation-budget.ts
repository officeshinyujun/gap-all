export type ReferenceGenerationBudget = Readonly<{
  questionCount: number;
  requestCount: number;
  requestBytes: number;
}>;

export const DEFAULT_REFERENCE_REPLACEMENT_ALLOWANCE = 5;

export type ReferenceGenerationWorkBudgetOptions = Readonly<{
  replacementAllowance?: unknown;
}>;

export type ReferenceGenerationWorkBudget = Readonly<{
  questionCount: number;
  replacementAllowance: number;
  candidateScanCap: number;
  plannerAttemptCap: number;
}>;

export type ReferenceCandidateOutcome =
  | Readonly<{ kind: 'accepted' }>
  | Readonly<{ kind: 'source' }>
  | Readonly<{ kind: 'planner' }>
  | Readonly<{ kind: 'fidelity' }>
  | Readonly<{ kind: 'admission' }>;

export type ReferenceCandidateOutcomeCounts = Readonly<{
  attempted: number;
  accepted: number;
  source: number;
  planner: number;
  fidelity: number;
  admission: number;
}>;

export type ReferenceGenerationFailureKind =
  | 'malformed_model_output'
  | 'local_validation'
  | 'authentication'
  | 'transport_or_service'
  | 'request_configuration';

export type ReferenceGenerationFailureDisposition = 'candidate_local' | 'fatal';

export function measureReferenceGenerationBudget(
  questionCount: number,
  blueprintRequest: string,
  generationRequests: readonly string[],
): ReferenceGenerationBudget {
  assertQuestionCount(questionCount);
  const requestBytes =
    Buffer.byteLength(blueprintRequest, 'utf8') +
    generationRequests.reduce(
      (total, request) => total + Buffer.byteLength(request, 'utf8'),
      0,
    );
  return {
    questionCount,
    requestCount: 1 + generationRequests.length,
    requestBytes,
  };
}

export function resolveReferenceGenerationWorkBudget(
  questionCount: number,
  options: ReferenceGenerationWorkBudgetOptions = {},
): ReferenceGenerationWorkBudget {
  assertQuestionCount(questionCount);
  const replacementAllowance = replacementAllowanceOrDefault(
    options.replacementAllowance,
  );
  const effectiveCap = Math.max(
    questionCount,
    questionCount + replacementAllowance,
  );

  return {
    questionCount,
    replacementAllowance,
    candidateScanCap: effectiveCap,
    plannerAttemptCap: effectiveCap,
  };
}

export function reconcileReferenceCandidateOutcomes(
  outcomes: readonly ReferenceCandidateOutcome[],
): ReferenceCandidateOutcomeCounts {
  let accepted = 0;
  let source = 0;
  let planner = 0;
  let fidelity = 0;
  let admission = 0;

  for (const outcome of outcomes) {
    switch (outcome.kind) {
      case 'accepted':
        accepted += 1;
        break;
      case 'source':
        source += 1;
        break;
      case 'planner':
        planner += 1;
        break;
      case 'fidelity':
        fidelity += 1;
        break;
      case 'admission':
        admission += 1;
        break;
      default:
        assertNever(outcome);
    }
  }

  return {
    attempted: outcomes.length,
    accepted,
    source,
    planner,
    fidelity,
    admission,
  };
}

export function referenceGenerationFailureDisposition(
  failureKind: ReferenceGenerationFailureKind,
): ReferenceGenerationFailureDisposition {
  switch (failureKind) {
    case 'malformed_model_output':
    case 'local_validation':
      return 'candidate_local';
    case 'authentication':
    case 'transport_or_service':
    case 'request_configuration':
      return 'fatal';
    default:
      return assertNever(failureKind);
  }
}

function assertQuestionCount(questionCount: number): void {
  if (!Number.isInteger(questionCount) || questionCount <= 0) {
    throw new Error('Question count must be a positive integer.');
  }
}

function replacementAllowanceOrDefault(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : DEFAULT_REFERENCE_REPLACEMENT_ALLOWANCE;
}

function assertNever(value: never): never {
  throw new Error(
    `Unhandled reference generation contract value: ${String(value)}`,
  );
}
