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
const normalize = (value: unknown) =>
  String(value ?? '').toLowerCase().replace(/[\s·()（）\-_/,:：]+/gu, '');

function validQuestion(question: any): boolean {
  const stem = String(
    question?.render_ready?.question_stem ?? question?.stem ?? '',
  ).trim();
  const options = question?.render_ready?.options_list ?? question?.options ?? [];
  const answer = Number(question?.correct_answer ?? question?.answer);
  return Boolean(
    stem &&
      Array.isArray(options) &&
      options.length >= 2 &&
      Number.isInteger(answer) &&
      answer >= 1 &&
      answer <= options.length,
  );
}

function loadSource() {
  const source: any[] = [];
  for (let unitNumber = 1; unitNumber <= 20; unitNumber += 1) {
    const file = path.join(
      ROOT,
      'textbook',
      'sungjik_frequency',
      `${unitNumber}단원.json`,
    );
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { concepts?: any[] };
    source.push(...(data.concepts ?? []).map((concept) => ({ unitNumber, concept })));
  }
  return source;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const databaseUrl = process.env.DATABASE_SUPABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_SUPABASE_URL is required.');

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const units = await client.query(
      `SELECT id, unit_number FROM textbook_units WHERE subject = 'sungjik'`,
    );
    const unitIds = new Map(
      units.rows.map((unit: any) => [Number(unit.unit_number), unit.id]),
    );
    const rows = await client.query(
      `SELECT c.id, c.unit_id, c.name
       FROM textbook_concept_cards c
       JOIN textbook_units u ON u.id = c.unit_id
       WHERE u.subject = 'sungjik'`,
    );
    const cards = new Map(
      rows.rows.map((row: any) => [`${row.unit_id}:${normalize(row.name)}`, row]),
    );

    const updates: any[] = [];
    const unmatched: string[] = [];
    for (const { unitNumber, concept } of loadSource()) {
      const unitId = unitIds.get(unitNumber);
      if (!unitId) throw new Error(`Missing sungjik unit: ${unitNumber}`);

      const candidates = rows.rows.filter(
        (row: any) =>
          row.unit_id === unitId &&
          (normalize(row.name) === normalize(concept.name) ||
            normalize(row.name).startsWith(normalize(concept.name)) ||
            normalize(concept.name).startsWith(normalize(row.name))),
      );
      if (candidates.length !== 1) continue;

      const question = concept.sampleQuestion;
      if (!validQuestion(question)) {
        throw new Error(`Invalid question: ${unitNumber}/${concept.name}`);
      }
      const row = cards.get(`${unitId}:${normalize(candidates[0].name)}`) as
        | { id: string; name: string }
        | undefined;
      if (!row) throw new Error(`Card lookup failed: ${unitNumber}/${concept.name}`);
      const { conceptHighlightV2, ...questionData } = question;

      updates.push({
        id: row.id,
        name: row.name,
        definition: concept.description || '',
        keyPoints: Array.isArray(concept.keyPoints) ? concept.keyPoints : [],
        textbookExcerpt: concept.conceptContent || '',
        enrichedDefinition: concept.conceptContent || '',
        realQuestion: {
          questionData,
          ...(conceptHighlightV2 ?? concept.conceptHighlightV2
            ? {
                conceptHighlightV2:
                  conceptHighlightV2 ?? concept.conceptHighlightV2,
              }
            : {}),
        },
      });
    }

    const matchedIds = new Set(updates.map((update) => update.id));
    for (const row of rows.rows as Array<{ id: string; name: string }>) {
      if (!matchedIds.has(row.id)) unmatched.push(row.name);
    }

    console.log(
      JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          matchedCards: updates.length,
          validQuestions: updates.length,
          untouchedCards: unmatched.length,
          untouchedExamples: unmatched.slice(0, 20),
        },
        null,
        2,
      ),
    );
    if (!apply) return;

    await client.query('BEGIN');
    for (const update of updates) {
      await client.query(
        `UPDATE textbook_concept_cards
         SET definition = $1, key_points = $2::jsonb, textbook_excerpt = $3,
             enriched_definition = $4, real_question = $5::jsonb
         WHERE id = $6`,
        [
          update.definition,
          JSON.stringify(update.keyPoints),
          update.textbookExcerpt,
          update.enrichedDefinition,
          JSON.stringify(update.realQuestion),
          update.id,
        ],
      );
    }
    await client.query('COMMIT');
    console.log('Applied strict exact/prefix matches only.');
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
