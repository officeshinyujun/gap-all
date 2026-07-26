import {
  GenerationDataResetError,
  GenerationDataResetService,
} from './generation-data-reset.service';

describe('GenerationDataResetService', () => {
  const approvedRequest = {
    databaseName: 'gap_generation_test',
    nodeEnv: 'test',
    confirmation: 'RESET_GENERATION_DATA',
    backupManifestId: 'backup-20260721',
  } as const;

  it('resets only the generation table allowlist in foreign-key order', async () => {
    const queries: string[] = [];
    const service = new GenerationDataResetService({
      runInTransaction: async (work) =>
        work({
          execute: (sql) => {
            queries.push(sql);
            return Promise.resolve();
          },
        }),
    });

    await service.reset(approvedRequest);

    expect(queries).toEqual([
      'DELETE FROM generation_exam_items',
      'DELETE FROM generation_exam_sessions',
      'DELETE FROM generated_questions',
      'DELETE FROM generation_runs',
      'DELETE FROM reference_questions',
    ]);
  });

  it.each([
    [{ ...approvedRequest, nodeEnv: 'production' }],
    [{ ...approvedRequest, databaseName: 'gap' }],
    [{ ...approvedRequest, confirmation: 'wrong' }],
    [{ ...approvedRequest, backupManifestId: '' }],
  ])(
    'rejects an unsafe reset request before executing SQL',
    async (request) => {
      const execute = jest.fn();
      const service = new GenerationDataResetService({
        runInTransaction: async (work) => work({ execute }),
      });

      await expect(service.reset(request)).rejects.toBeInstanceOf(
        GenerationDataResetError,
      );
      expect(execute).not.toHaveBeenCalled();
    },
  );
});
