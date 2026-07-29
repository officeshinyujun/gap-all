import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

type QueryResult<T> = { rows: T[] };

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

type SourceCard = {
  content?: {
    title?: unknown;
    description?: unknown;
    body?: unknown;
    integrated_data?: {
      table?: unknown;
      logic_flow?: unknown;
      visual_analysis?: unknown;
    };
    bullet_points?: unknown;
    trap_points?: unknown;
    key_concepts?: unknown;
    tags?: unknown;
  };
};

type SummationCard = {
  cardIndex: number;
  title: string;
  body: string;
  keyConcepts: unknown[];
};

type UnitSummation = {
  unitNumber: number;
  cards: SummationCard[];
};

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_DIR = path.join(ROOT, 'textbook', 'sungjik_summation');
const TARGET_UNITS = Array.from({ length: 10 }, (_, index) => index + 11);

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function parseSource(unitNumber: number): UnitSummation {
  const sourcePath = path.join(SOURCE_DIR, `${unitNumber}단원.md`);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const match = source.match(/```json\s*([\s\S]*?)\s*```/i);
  if (!match) throw new Error(`${sourcePath}: fenced JSON payload was not found.`);

  const parsed = JSON.parse(match[1]) as { cards?: unknown };
  if (!Array.isArray(parsed.cards) || parsed.cards.length === 0) {
    throw new Error(`${sourcePath}: cards must be a non-empty array.`);
  }

  const cards = (parsed.cards as SourceCard[]).map((sourceCard, cardIndex) => {
    const content = sourceCard.content ?? {};
    const title = stringValue(content.title);
    const bulletPoints = stringArray(content.bullet_points);
    const trapPoints = stringArray(content.trap_points);
    const body = [
      stringValue(content.description),
      stringValue(content.body),
      stringValue(content.integrated_data?.table),
      stringValue(content.integrated_data?.logic_flow),
      stringValue(content.integrated_data?.visual_analysis),
      bulletPoints.length ? bulletPoints.map((point) => `- ${point}`).join('\n') : '',
      trapPoints.length ? `주의: ${trapPoints.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    const keyConcepts = Array.isArray(content.key_concepts)
      ? content.key_concepts
      : stringArray(content.tags);

    if (!title || !body) {
      throw new Error(`${sourcePath}: card ${cardIndex + 1} is missing title or body.`);
    }

    return { cardIndex, title, body, keyConcepts };
  });

  return { unitNumber, cards };
}

function isSameCard(
  existing: { card_index: number; title: string; body: string; key_concepts: unknown },
  expected: SummationCard,
): boolean {
  return (
    existing.card_index === expected.cardIndex &&
    existing.title === expected.title &&
    existing.body === expected.body &&
    JSON.stringify(existing.key_concepts ?? []) === JSON.stringify(expected.keyConcepts)
  );
}

async function main() {
  if (!process.env.DATABASE_SUPABASE_URL) {
    throw new Error('DATABASE_SUPABASE_URL is required.');
  }

  const sourceUnits = TARGET_UNITS.map(parseSource);
  const expectedCardCount = sourceUnits.reduce((total, unit) => total + unit.cards.length, 0);
  const client = new Client({
    connectionString: process.env.DATABASE_SUPABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE textbook_summation_cards IN SHARE ROW EXCLUSIVE MODE');

    const unitsResult = await client.query<{ id: string; unit_number: number }>(
      `SELECT id, unit_number
       FROM textbook_units
       WHERE subject = $1 AND unit_number = ANY($2::int[])
       ORDER BY unit_number`,
      ['sungjik', TARGET_UNITS],
    );
    if (unitsResult.rows.length !== TARGET_UNITS.length) {
      throw new Error('Not all target textbook_units rows exist for sungjik units 11-20.');
    }

    const unitIdByNumber = new Map<number, string>(
      unitsResult.rows.map(
        (unit): [number, string] => [Number(unit.unit_number), String(unit.id)],
      ),
    );
    const existingResult = await client.query<{
      unit_id: string;
      card_index: number;
      title: string;
      body: string;
      key_concepts: unknown;
    }>(
      `SELECT unit_id, card_index, title, body, key_concepts
       FROM textbook_summation_cards
       WHERE unit_id = ANY($1::uuid[])
       ORDER BY unit_id, card_index`,
      [unitsResult.rows.map((unit) => unit.id)],
    );

    const existingByUnit = new Map<string, typeof existingResult.rows>();
    for (const card of existingResult.rows) {
      const cards = existingByUnit.get(card.unit_id) ?? [];
      cards.push(card);
      existingByUnit.set(card.unit_id, cards);
    }

    let inserted = 0;
    let verified = 0;
    for (const unit of sourceUnits) {
      const unitId = unitIdByNumber.get(unit.unitNumber);
      if (!unitId) {
        throw new Error(`textbook_units ID missing for sungjik unit ${unit.unitNumber}.`);
      }
      const existingCards = existingByUnit.get(unitId) ?? [];
      if (existingCards.length > 0) {
        const expectedByIndex = new Map(unit.cards.map((card) => [card.cardIndex, card]));
        const isExactMatch =
          existingCards.length === unit.cards.length &&
          existingCards.every((card) => {
            const expected = expectedByIndex.get(card.card_index);
            return expected ? isSameCard(card, expected) : false;
          });
        if (!isExactMatch) {
          throw new Error(
            `sungjik unit ${unit.unitNumber} already has different summation cards; refusing to overwrite.`,
          );
        }
        verified += existingCards.length;
        continue;
      }

      for (const card of unit.cards) {
        await client.query(
          `INSERT INTO textbook_summation_cards
             (unit_id, card_index, title, body, key_concepts)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [unitId, card.cardIndex, card.title, card.body, JSON.stringify(card.keyConcepts)],
        );
        inserted += 1;
      }
    }

    if (inserted + verified !== expectedCardCount) {
      throw new Error('Post-write card total does not match the source total.');
    }

    await client.query('COMMIT');
    console.log(
      JSON.stringify(
        { subject: 'sungjik', units: TARGET_UNITS, expectedCardCount, inserted, verified },
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
