export type StagedReferenceQuestion = Readonly<{
  slotId: string;
  content: Record<string, unknown>;
  lineage?: Readonly<{
    fidelity?: Readonly<{ receipt?: Record<string, unknown> }>;
  }>;
}>;
export type ReferenceGenerationPersistence = Readonly<{
  writeComplete: (
    questions: readonly StagedReferenceQuestion[],
  ) => Promise<void>;
  writeFailedRun: (reason: string) => Promise<void>;
}>;

export class ReferenceGenerationStaging {
  private readonly activeKeys = new Set<string>();

  async persist(
    idempotencyKey: string,
    expectedSlotIds: readonly string[],
    questions: readonly StagedReferenceQuestion[],
    persistence: ReferenceGenerationPersistence,
  ): Promise<'completed' | 'rejected'> {
    if (this.activeKeys.has(idempotencyKey)) return 'rejected';
    this.activeKeys.add(idempotencyKey);
    try {
      const actual = new Set(questions.map((question) => question.slotId));
      if (
        actual.size !== expectedSlotIds.length ||
        expectedSlotIds.some((slotId) => !actual.has(slotId))
      ) {
        await persistence.writeFailedRun('SLOT_COVERAGE_MISMATCH');
        return 'rejected';
      }
      await persistence.writeComplete(questions);
      return 'completed';
    } finally {
      this.activeKeys.delete(idempotencyKey);
    }
  }
}
