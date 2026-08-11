import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DataSource, In } from 'typeorm';
import { UnitExamProfile } from '../src/entities/unit-exam-profile.entity';
import type { StudyMustKnowBlock } from '../src/study/study-insights';
import { buildStudyMustKnowBlocks } from '../src/study/study-must-know';

const SUBJECTS = {
  success: 'success_cards_moi',
  industry: 'kongil_cards_moi',
} as const;

async function main(): Promise<void> {
  const subjectFilter = valueOf('--subject');
  const subjects = subjectFilter === undefined
    ? Object.keys(SUBJECTS)
    : [subjectFilter];
  if (subjects.some((subject) => !(subject in SUBJECTS))) {
    throw new Error('--subject must be success or industry.');
  }
  const write = process.argv.includes('--write');
  const dataSource = new DataSource({
    type: 'postgres',
    url: requiredDatabaseUrl(),
    entities: [UnitExamProfile],
    synchronize: false,
  });
  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(UnitExamProfile);
    const rows = await repo.find({ where: { subjectSlug: In(subjects) } });
    const cards = subjects.flatMap((subject) => loadCards(subject));
    const cardsByUnit = new Map<string, StudyMustKnowBlock[]>();
    for (const card of cards) {
      const key = `${card.subjectSlug}:${card.unitNumber}`;
      const blocks = cardsByUnit.get(key) ?? [];
      const block = cardBlock(card);
      if (block !== null) blocks.push(block);
      cardsByUnit.set(key, blocks);
    }

    let savedBlocks = 0;
    let storedAiBlocks = 0;
    for (const row of rows) {
      const key = `${row.subjectSlug}:${row.unitNumber}`;
      const existing = (row.profile as { studyInsights?: any }).studyInsights;
      const existingCount = Array.isArray(existing?.mustKnowBlocks)
        ? existing.mustKnowBlocks.length
        : 0;
      storedAiBlocks += Array.isArray(existing?.mustKnowBlocks)
        ? existing.mustKnowBlocks.filter((block: any) => block.provenance === 'ai').length
        : 0;
      const generated = cardsByUnit.get(key) ?? [];
      const preserved = Array.isArray(existing?.mustKnowBlocks)
        ? existing.mustKnowBlocks
          .filter((block: any) =>
            !String(block.id).startsWith('card-') || block.provenance === 'ai',
          )
          .map(cleanBlock)
        : [];
      const curated = buildStudyMustKnowBlocks(
        row.subjectSlug as 'success' | 'industry',
        row.unitNumber,
        Array.isArray(existing?.patterns) ? existing.patterns : [],
      );
      const patterns = Array.isArray(existing?.patterns)
        ? normalizePatterns(existing.patterns)
        : existing?.patterns;
      const merged = new Map(generated.map((block) => [block.id, block]));
      for (const block of curated) merged.set(block.id, block);
      for (const block of preserved) merged.set(block.id, block);
      const mustKnowBlocks = [...merged.values()];
      savedBlocks += generated.length;
      console.log(`${write ? 'write' : 'dry-run'} ${key}: ${generated.length} card blocks, ${existingCount} stored blocks`);
      if (!write) continue;
      row.profile = {
        ...row.profile,
        studyInsights: {
          ...(existing ?? {}),
          version: 'v2',
          patterns,
          mustKnowBlocks,
        },
      };
      await repo.save(row);
    }
    console.log(JSON.stringify({ write, units: rows.length, cardBlocks: savedBlocks, storedAiBlocks }));
  } finally {
    await dataSource.destroy();
  }
}

function loadCards(subjectSlug: string): Array<{
  subjectSlug: string;
  unitNumber: number;
  card: any;
}> {
  const root = path.resolve(__dirname, '..', '..', 'textbook', SUBJECTS[subjectSlug as keyof typeof SUBJECTS]);
  return fs.readdirSync(root)
    .filter((file) => /^\d+단원\.json$/u.test(file))
    .flatMap((file) => {
      const unitNumber = Number(file.match(/^(\d+)단원/u)?.[1]);
      const parsed = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as { concepts?: any[] };
      return (parsed.concepts ?? []).map((card) => ({ subjectSlug, unitNumber, card }));
    });
}

function cardBlock(input: { subjectSlug: string; unitNumber: number; card: any }): StudyMustKnowBlock | null {
  const card = input.card.card ?? input.card;
  const keyPoints = strings(card.keyPoints ?? card.key_points);
  const importantNumbers = (Array.isArray(card.importantNumbers) ? card.importantNumbers : [])
    .filter((value: unknown) => value !== null && value !== undefined)
    .map(String);
  const comparisonTable = typeof card.comparisonTable === 'string' ? card.comparisonTable.trim() : '';
  const caution = typeof card.caution === 'string' ? card.caution.trim() : '';
  if (keyPoints.length === 0 && importantNumbers.length === 0 && comparisonTable === '') return null;
  return {
    id: `card-${input.subjectSlug}-${input.unitNumber}-${input.card.id ?? input.card.name}`,
    conceptAliases: [String(input.card.name)],
    title: comparisonTable === '' ? '핵심 암기' : '비교해서 외울 것',
    type: comparisonTable === '' ? 'checklist' : 'comparison',
    ...(comparisonTable === '' ? {} : { summary: comparisonTable }),
    mustRemember: [
      ...keyPoints,
      ...importantNumbers.map((value) => `중요 수치: ${value}`),
    ].slice(0, 5),
    commonTraps: caution === '' ? [] : [caution],
    referenceQuestionIds: [],
    confidence: 'related',
    reviewStatus: 'textbook_only',
  };
}

function cleanBlock(block: any): StudyMustKnowBlock {
  return {
    ...block,
    ...(typeof block.summary === 'string' ? { summary: cleanText(block.summary) } : {}),
    mustRemember: Array.isArray(block.mustRemember) ? block.mustRemember.map(cleanText) : [],
    commonTraps: Array.isArray(block.commonTraps) ? block.commonTraps.map(cleanText) : [],
  };
}

function cleanText(value: string): string {
  return value.replace(/\s*\(ref:\s*[^)]+\)/giu, '').trim();
}

function normalizePatterns(patterns: readonly any[]): any[] {
  return patterns
    .map((pattern) => {
      const referenceQuestionIds = [...new Set(strings(pattern.referenceQuestionIds))];
      return { ...pattern, referenceQuestionIds, frequency: referenceQuestionIds.length };
    })
    .sort((left, right) =>
      right.frequency - left.frequency || String(left.title).localeCompare(String(right.title), 'ko'),
    );
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : [];
}

function valueOf(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function requiredDatabaseUrl(): string {
  const value = process.env.DATABASE_SUPABASE_URL ?? process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_SUPABASE_URL or DATABASE_URL is required.');
  return value;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
