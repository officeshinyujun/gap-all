import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { Client } = require('pg') as {
  Client: new (options: {
    connectionString: string;
    ssl: { rejectUnauthorized: boolean };
  }) => any;
};

const ROOT = path.resolve(__dirname, '..', '..');
const SUBJECTS = [
  { slug: 'industry', dbSubject: 'kongil' },
  { slug: 'success', dbSubject: 'sungjik' },
] as const;

const normalize = (value: unknown) =>
  String(value ?? '').toLowerCase().replace(/[\s·()（）\-_/,:：]+/gu, '');

function loadCards() {
  return SUBJECTS.flatMap(({ slug, dbSubject }) =>
    Array.from({ length: 20 }, (_, index) => index + 1).flatMap((unitNumber) => {
      const file = path.join(
        ROOT,
        'textbook',
        '_v2',
        'study-rebuild',
        slug,
        `unit-${String(unitNumber).padStart(2, '0')}.json`,
      );
      if (!fs.existsSync(file)) throw new Error(`Missing study rebuild file: ${file}`);
      const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { cards?: any[] };
      return (data.cards ?? []).map((card) => ({ dbSubject, unitNumber, card }));
    }),
  );
}

async function main() {
  const apply = process.argv.includes('--apply');
  const databaseUrl = process.env.DATABASE_SUPABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_SUPABASE_URL is required.');

  const source = loadCards();
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const units = await client.query(
      `SELECT id, subject, unit_number FROM textbook_units WHERE subject = ANY($1::text[])`,
      [SUBJECTS.map((subject) => subject.dbSubject)],
    );
    const unitIds = new Map(
      units.rows.map((unit: any) => [`${unit.subject}:${Number(unit.unit_number)}`, unit.id]),
    );
    const rows = await client.query(
      `SELECT c.id, c.unit_id, c.name, c.real_question
       FROM textbook_concept_cards c
       JOIN textbook_units u ON u.id = c.unit_id
       WHERE u.subject = ANY($1::text[])`,
      [SUBJECTS.map((subject) => subject.dbSubject)],
    );
    const cards = new Map(
      rows.rows.map((row: any) => [`${row.unit_id}:${normalize(row.name)}`, row]),
    );

    const updates: any[] = [];
    for (const item of source) {
      const unitId = unitIds.get(`${item.dbSubject}:${item.unitNumber}`);
      if (!unitId) throw new Error(`Missing unit: ${item.dbSubject}/${item.unitNumber}`);
      const row = cards.get(`${unitId}:${normalize(item.card.name)}`) as
        | { id: string; real_question?: any }
        | undefined;
      if (!row) throw new Error(`No card for ${item.dbSubject}/${item.unitNumber}/${item.card.name}`);
      const content = item.card.conceptContent ?? {};
      const { conceptHighlightV2: questionHighlight, ...questionData } =
        item.card.sampleQuestion ?? {};
      updates.push({
        id: row.id,
        definition: item.card.description || content.definition || '',
        keyPoints: Array.isArray(item.card.keyPoints) ? item.card.keyPoints : [],
        textbookExcerpt: content.textbookExcerpt || '',
        enrichedDefinition: content.enrichedDefinition || '',
        realQuestion: item.card.sampleQuestion
          ? {
              questionData,
              ...(item.card.conceptHighlightV2 ?? questionHighlight
                ? {
                    conceptHighlightV2:
                      item.card.conceptHighlightV2 ?? questionHighlight,
                  }
                : row.real_question?.conceptHighlightV2
                  ? { conceptHighlightV2: row.real_question.conceptHighlightV2 }
                  : {}),
            }
          : null,
      });
    }

    const withQuestions = updates.filter((update) => update.realQuestion).length;
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', cards: updates.length, withQuestions }, null, 2));
    if (!apply) return;

    await client.query('BEGIN');
    for (const update of updates) {
      await client.query(
        `UPDATE textbook_concept_cards
         SET definition = $1, key_points = $2::jsonb, textbook_excerpt = $3,
             enriched_definition = $4, real_question = COALESCE($5::jsonb, real_question)
         WHERE id = $6`,
        [
          update.definition,
          JSON.stringify(update.keyPoints),
          update.textbookExcerpt,
          update.enrichedDefinition,
          update.realQuestion ? JSON.stringify(update.realQuestion) : null,
          update.id,
        ],
      );
    }
    await client.query('COMMIT');
    console.log('Applied without deleting or recreating cards.');
  } catch (error) {
    if (apply) await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
