import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { Between, DataSource, In } from 'typeorm';
import { ReferenceQuestion } from '../src/entities/reference-question.entity';
import { parseReference } from '../src/exams/reference-selector.utils';
import type { SubjectStyle } from '../src/exams/reference-frame.types';

type BaselineRow = Readonly<{
  sourceId: string;
  sourceHash: string;
  unitNumber: number;
  subject: string;
  targetConcept: string;
  sourceTemplate: string | null;
  archetype: unknown;
  stimulus: string;
  choices: readonly string[];
  correctAnswer: number | null;
}>;

async function main(): Promise<void> {
  const subjectSlug = option('--subject') ?? 'success';
  const start = integer(option('--start'), 1);
  const end = integer(option('--end'), start);
  const output =
    option('--output') ?? `ai-baseline-${subjectSlug}-${start}-${end}.json`;
  const dataSource = new DataSource({
    type: 'postgres',
    url: requiredDatabaseUrl(),
    entities: [ReferenceQuestion],
    synchronize: false,
  });
  try {
    await dataSource.initialize();
    const rows = await dataSource.getRepository(ReferenceQuestion).find({
      where: {
        subject: In(catalogSubjects(subjectSlug)),
        unitNumber: Between(start, end),
      },
    });
    const subject = subjectStyle(subjectSlug);
    const corpus: BaselineRow[] = [];
    for (const row of rows) {
      const source = isRecord(row.sourcePayload.source)
        ? row.sourcePayload.source
        : {};
      const parsed = parseReference(
        {
          ...row.sourcePayload,
          source: {
            ...source,
            unitNumber: row.unitNumber,
          },
        },
        subject,
      );
      if (!parsed.ok) continue;
      corpus.push({
        sourceId: parsed.value.source.sourceId,
        sourceHash: parsed.value.source.sourceHash,
        unitNumber: parsed.value.unitNumber,
        subject: row.subject,
        targetConcept: parsed.value.target.primaryConcept,
        sourceTemplate: parsed.value.archetype?.sourceTemplate ?? null,
        archetype: parsed.value.archetype ?? null,
        stimulus: parsed.value.stimulus,
        choices: parsed.value.choices,
        correctAnswer: parsed.value.correctAnswer ?? null,
      });
    }
    await writeFile(output, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
    process.stdout.write(
      `${JSON.stringify({
        output,
        subjectSlug,
        start,
        end,
        count: corpus.length,
      })}\n`,
    );
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

function requiredDatabaseUrl(): string {
  const value =
    process.env.DATABASE_URL ??
    process.env.DATABASE_LOCAL_URL ??
    process.env.DATABASE_SUPABASE_URL;
  if (value === undefined || value.trim() === '') {
    throw new Error(
      'DATABASE_URL, DATABASE_LOCAL_URL, or DATABASE_SUPABASE_URL is required.',
    );
  }
  return value;
}

function subjectStyle(subjectSlug: string): SubjectStyle {
  if (subjectSlug === 'success') return 'success';
  if (subjectSlug === 'industry') return 'kongil';
  throw new Error(`Unsupported subject: ${subjectSlug}`);
}

function catalogSubjects(subjectSlug: string): readonly string[] {
  if (subjectSlug === 'success') return ['success', 'sungjik'];
  if (subjectSlug === 'industry') return ['industry', 'kongil'];
  return [subjectSlug];
}

function option(name: string): string | undefined {
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function integer(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('Unit must be a positive integer.');
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

void main();
