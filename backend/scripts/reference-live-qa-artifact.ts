import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type ReferenceLiveQaArtifact = Readonly<{
  fixtureId: string;
  sourceHashes: readonly string[];
  outputHashes: readonly string[];
  deterministic: 'passed';
  copyPolicy: 'passed';
  semanticVerifier: Readonly<{
    models: readonly string[];
    verdict: 'accepted';
    reasonCodes: readonly string[];
  }>;
  retryCounts: readonly number[];
  status: 'passed';
}>;

export function writeReferenceLiveQaArtifact(
  directory: string,
  artifact: ReferenceLiveQaArtifact,
): Readonly<{ jsonPath: string; markdownPath: string }> {
  mkdirSync(directory, { recursive: true });
  const baseName = `reference-live-${artifact.fixtureId}`;
  const jsonPath = join(directory, `${baseName}.json`);
  const markdownPath = join(directory, `${baseName}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(
    markdownPath,
    [
      `# ${artifact.fixtureId}`,
      '',
      `Status: ${artifact.status}`,
      `Source hashes: ${artifact.sourceHashes.join(', ')}`,
      `Output hashes: ${artifact.outputHashes.join(', ')}`,
      `Deterministic checks: ${artifact.deterministic}`,
      `Copy policy: ${artifact.copyPolicy}`,
      `Verifier verdict: ${artifact.semanticVerifier.verdict}`,
      `Verifier models: ${artifact.semanticVerifier.models.join(', ')}`,
      `Verifier reasons: ${artifact.semanticVerifier.reasonCodes.join(', ')}`,
      `Retry counts: ${artifact.retryCounts.join(', ')}`,
      '',
    ].join('\n'),
  );
  return { jsonPath, markdownPath };
}
