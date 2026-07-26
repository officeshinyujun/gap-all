import { ReferenceGenerationStaging } from './reference-generation-persistence';

describe('ReferenceGenerationStaging', () => {
  it('writes only exact staged coverage and audits failed coverage', async () => {
    const writeComplete = jest.fn().mockResolvedValue(undefined);
    const writeFailedRun = jest.fn().mockResolvedValue(undefined);
    const staging = new ReferenceGenerationStaging();
    expect(
      await staging.persist(
        'key',
        ['a', 'b'],
        [
          { slotId: 'a', content: {} },
          { slotId: 'b', content: {} },
        ],
        { writeComplete, writeFailedRun },
      ),
    ).toBe('completed');
    expect(
      await staging.persist(
        'key-2',
        ['a', 'b'],
        [{ slotId: 'a', content: {} }],
        { writeComplete, writeFailedRun },
      ),
    ).toBe('rejected');
    expect(writeComplete).toHaveBeenCalledTimes(1);
    expect(writeFailedRun).toHaveBeenCalledWith('SLOT_COVERAGE_MISMATCH');
  });

  it('does not write complete questions when a semantic rejection leaves a slot missing', async () => {
    const writeComplete = jest.fn().mockResolvedValue(undefined);
    const writeFailedRun = jest.fn().mockResolvedValue(undefined);

    const outcome = await new ReferenceGenerationStaging().persist(
      'semantic-rejection',
      ['slot-1', 'slot-2'],
      [{ slotId: 'slot-1', content: { validation: 'passed' } }],
      { writeComplete, writeFailedRun },
    );

    expect(outcome).toBe('rejected');
    expect(writeComplete).not.toHaveBeenCalled();
    expect(writeFailedRun).toHaveBeenCalledWith('SLOT_COVERAGE_MISMATCH');
  });

  it('preserves a non-sensitive fidelity receipt for the transaction writer', async () => {
    const writeComplete = jest.fn().mockResolvedValue(undefined);
    const writeFailedRun = jest.fn().mockResolvedValue(undefined);
    const staged = {
      slotId: 'slot-1',
      content: {},
      lineage: {
        fidelity: {
          receipt: {
            deterministic: 'passed',
            copyPolicy: 'passed',
            semanticVerifier: {
              verdict: 'accepted',
              reasonCode: 'RULE_PRESERVED',
            },
            retryCount: 0,
          },
        },
      },
    };

    await new ReferenceGenerationStaging().persist(
      'receipt',
      ['slot-1'],
      [staged],
      { writeComplete, writeFailedRun },
    );

    expect(writeComplete).toHaveBeenCalledWith([staged]);
    expect(JSON.stringify(writeComplete.mock.calls)).not.toContain(
      'referenceSource',
    );
  });
});
