export type ReferenceGenerationBudget = Readonly<{
  questionCount: number;
  requestCount: number;
  requestBytes: number;
}>;

export function measureReferenceGenerationBudget(
  questionCount: number,
  blueprintRequest: string,
  generationRequests: readonly string[],
): ReferenceGenerationBudget {
  if (!Number.isInteger(questionCount) || questionCount <= 0) {
    throw new Error('Question count must be a positive integer.');
  }
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
