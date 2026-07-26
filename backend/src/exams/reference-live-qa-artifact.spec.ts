import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeReferenceLiveQaArtifact } from '../../scripts/reference-live-qa-artifact';

describe('writeReferenceLiveQaArtifact', () => {
  it('Given a passed redacted receipt, When writing evidence, Then emits inspectable JSON and Markdown without source content', () => {
    const directory = mkdtempSync(join(tmpdir(), 'reference-live-qa-'));
    try {
      const paths = writeReferenceLiveQaArtifact(directory, {
        fixtureId: 'comparison-table',
        sourceHashes: ['source-hash'],
        outputHashes: ['output-hash'],
        deterministic: 'passed',
        copyPolicy: 'passed',
        semanticVerifier: {
          models: ['gpt-5.6'],
          verdict: 'accepted',
          reasonCodes: ['SOURCE_RELATIONS_PRESERVED'],
        },
        retryCounts: [0],
        status: 'passed',
      });

      expect(JSON.parse(readFileSync(paths.jsonPath, 'utf8'))).toEqual(
        expect.objectContaining({
          fixtureId: 'comparison-table',
          status: 'passed',
        }),
      );
      expect(readFileSync(paths.markdownPath, 'utf8')).toContain(
        'Output hashes: output-hash',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
