import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { DataSource, MoreThanOrEqual } from 'typeorm';
import { AiGenerationCandidate } from '../src/entities/ai-generation-candidate.entity';

// Exports persisted provider candidates (accepted and rejected) with their
// blueprint snapshots so validator changes can be replayed offline:
//   npm run export:ai-candidates -- --since=2026-10-01 --output=corpus.json
//   npm run shadow:ai -- --input=corpus.json
async function main(): Promise<void> {
  const since = option('--since') ?? '1970-01-01';
  const output = option('--output') ?? 'ai-candidate-corpus.json';
  const dataSource = new DataSource({
    type: 'postgres',
    url:
      process.env.DATABASE_URL ??
      process.env.DATABASE_LOCAL_URL ??
      process.env.DATABASE_SUPABASE_URL,
    entities: [AiGenerationCandidate],
    synchronize: false,
  });
  await dataSource.initialize();
  try {
    const rows = await dataSource.getRepository(AiGenerationCandidate).find({
      where: { createdAt: MoreThanOrEqual(new Date(since)) },
      order: { createdAt: 'ASC' },
    });
    const corpus = rows.flatMap((row) => {
      const blueprint = row.validation?.blueprint;
      if (row.candidate === null || blueprint === undefined || blueprint === null) {
        return [];
      }
      return [
        {
          blueprint,
          candidate: row.candidate,
          model: row.providerModel ?? undefined,
          attempt: row.attempt,
          recordedStatus: row.status,
          recordedFailureCode: row.failureCode,
        },
      ];
    });
    await writeFile(output, `${JSON.stringify(corpus, null, 2)}\n`);
    process.stdout.write(
      `Exported ${corpus.length}/${rows.length} replayable candidates to ${output}\n`,
    );
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

function option(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

void main();
