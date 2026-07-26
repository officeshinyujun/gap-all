const REQUIRED_CONFIRMATION = 'RESET_GENERATION_DATA' as const;
const APPROVED_DATABASE_SUFFIX = '_generation_test' as const;
const GENERATION_TABLES_IN_DELETE_ORDER = [
  'generation_exam_items',
  'generation_exam_sessions',
  'generated_questions',
  'generation_runs',
  'reference_questions',
] as const;

export type GenerationDataResetRequest = Readonly<{
  databaseName: string;
  nodeEnv: string;
  confirmation: string;
  backupManifestId: string;
}>;

export type GenerationResetTransaction = Readonly<{
  execute: (sql: string) => Promise<void>;
}>;

export type GenerationDataResetDependencies = Readonly<{
  runInTransaction: <T>(
    work: (transaction: GenerationResetTransaction) => Promise<T>,
  ) => Promise<T>;
}>;

export class GenerationDataResetError extends Error {
  readonly name = 'GenerationDataResetError';
}

export class GenerationDataResetService {
  constructor(private readonly dependencies: GenerationDataResetDependencies) {}

  async reset(request: GenerationDataResetRequest): Promise<void> {
    validateGenerationDataResetRequest(request);
    await this.dependencies.runInTransaction(async (transaction) => {
      for (const table of GENERATION_TABLES_IN_DELETE_ORDER) {
        await transaction.execute(`DELETE FROM ${table}`);
      }
    });
  }
}

export function validateGenerationDataResetRequest(
  request: GenerationDataResetRequest,
): void {
  if (request.nodeEnv === 'production') {
    throw new GenerationDataResetError(
      'Generation reset is disabled in production.',
    );
  }
  if (!request.databaseName.endsWith(APPROVED_DATABASE_SUFFIX)) {
    throw new GenerationDataResetError(
      'Database name is not approved for generation reset.',
    );
  }
  if (request.confirmation !== REQUIRED_CONFIRMATION) {
    throw new GenerationDataResetError(
      'Generation reset confirmation is invalid.',
    );
  }
  if (request.backupManifestId.trim().length === 0) {
    throw new GenerationDataResetError(
      'A backup manifest is required before reset.',
    );
  }
}
