import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

type QueryResult<T> = { rows: T[]; rowCount: number | null };

interface PgClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string): Promise<QueryResult<never>>;
  query<T>(sql: string, values: unknown[]): Promise<QueryResult<T>>;
}

const { Client } = require('pg') as {
  Client: new (options: {
    connectionString: string;
    ssl: { rejectUnauthorized: boolean };
  }) => PgClient;
};

type SourceConcept = {
  id?: unknown;
  realQuestion?: unknown;
  caution?: unknown;
  quiz?: unknown;
};

type SourceCard = {
  subject: 'sungjik' | 'kongil';
  unitNumber: number;
  conceptId: string;
  realQuestion: unknown;
  caution: string | null;
  quiz: unknown[];
};

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCES: ReadonlyArray<readonly [string, SourceCard['subject']]> = [
  ['success_cards_moi', 'sungjik'],
  ['kongil_cards_moi', 'kongil'],
];

function loadCards(): SourceCard[] {
  const cards: SourceCard[] = [];
  for (const [folder, subject] of SOURCES) {
    const directory = path.join(ROOT, 'textbook', folder);
    const files = fs
      .readdirSync(directory)
      .filter((file) => /^\d+단원\.json$/.test(file));

    for (const file of files) {
      const unitNumber = Number(file.match(/^(\d+)단원\.json$/)?.[1]);
      const parsed = JSON.parse(
        fs.readFileSync(path.join(directory, file), 'utf8'),
      ) as { concepts?: unknown };
      if (!Number.isInteger(unitNumber) || !Array.isArray(parsed.concepts)) {
        throw new Error(`${file}: expected a unit number and concepts array.`);
      }

      for (const concept of parsed.concepts as SourceConcept[]) {
        const conceptId = typeof concept.id === 'string' ? concept.id : '';
        if (!conceptId) throw new Error(`${file}: a concept is missing its id.`);
        cards.push({
          subject,
          unitNumber,
          conceptId,
          realQuestion: concept.realQuestion ?? null,
          caution: typeof concept.caution === 'string' ? concept.caution : null,
          quiz: Array.isArray(concept.quiz) ? concept.quiz : [],
        });
      }
    }
  }
  return cards;
}

async function main() {
  if (!process.env.DATABASE_SUPABASE_URL) {
    throw new Error('DATABASE_SUPABASE_URL is required.');
  }

  const sourceCards = loadCards();
  const client = new Client({
    connectionString: process.env.DATABASE_SUPABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE textbook_concept_cards IN SHARE ROW EXCLUSIVE MODE');
    await client.query(
      `ALTER TABLE textbook_concept_cards
         ADD COLUMN IF NOT EXISTS real_question jsonb,
         ADD COLUMN IF NOT EXISTS caution text,
         ADD COLUMN IF NOT EXISTS quiz jsonb`,
    );

    const units = await client.query<{
      id: string;
      subject: SourceCard['subject'];
      unit_number: number;
    }>(
      `SELECT id, subject, unit_number
       FROM textbook_units
       WHERE subject = ANY($1::text[])`,
      [SOURCES.map(([, subject]) => subject)],
    );
    const unitIds = new Map<string, string>(
      units.rows.map(
        (unit): [string, string] => [
          `${unit.subject}:${Number(unit.unit_number)}`,
          String(unit.id),
        ],
      ),
    );

    let updated = 0;
    let realQuestions = 0;
    for (const card of sourceCards) {
      const unitId = unitIds.get(`${card.subject}:${card.unitNumber}`);
      if (!unitId) {
        throw new Error(`Missing textbook unit: ${card.subject}/${card.unitNumber}.`);
      }
      const result = await client.query(
        `UPDATE textbook_concept_cards
         SET real_question = $1::jsonb, caution = $2, quiz = $3::jsonb
         WHERE unit_id = $4 AND concept_id = $5`,
        [
          card.realQuestion === null ? null : JSON.stringify(card.realQuestion),
          card.caution,
          JSON.stringify(card.quiz),
          unitId,
          card.conceptId,
        ],
      );
      if (result.rowCount !== 1) {
        throw new Error(
          `Expected exactly one concept card for ${card.subject}/${card.unitNumber}/${card.conceptId}; found ${result.rowCount}.`,
        );
      }
      updated += 1;
      if (card.realQuestion) realQuestions += 1;
    }

    const verification = await client.query<{
      cards: number;
      real_questions: number;
    }>(
      `SELECT count(*)::int AS cards,
              count(*) FILTER (WHERE real_question IS NOT NULL AND real_question <> 'null'::jsonb)::int AS real_questions
       FROM textbook_concept_cards`,
      [],
    );
    if (verification.rows[0].cards !== sourceCards.length) {
      throw new Error('Remote card count differs from the source card count.');
    }

    await client.query('COMMIT');
    console.log(
      JSON.stringify(
        {
          cardsUpdated: updated,
          sourceRealQuestions: realQuestions,
          remoteRealQuestions: verification.rows[0].real_questions,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
