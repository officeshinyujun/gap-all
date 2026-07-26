export type ReferenceGenerationUsageAttempt = Readonly<{
  runId: string;
  stage: 'blueprint' | 'generation';
  batchOrdinal: number;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  retry: boolean;
  requestBytes: number;
}>;

export class ReferenceGenerationUsageCollector {
  private readonly attempts = new Map<
    string,
    ReferenceGenerationUsageAttempt
  >();

  record(attempt: ReferenceGenerationUsageAttempt): void {
    this.attempts.set(key(attempt), attempt);
  }

  all(): readonly ReferenceGenerationUsageAttempt[] {
    return [...this.attempts.values()];
  }
}

function key(attempt: ReferenceGenerationUsageAttempt): string {
  return `${attempt.runId}:${attempt.stage}:${attempt.batchOrdinal}:${attempt.retry}`;
}
