import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

const ROOT = path.resolve(__dirname, '..', '..');
const DATABASE_URL = process.env.DATABASE_LOCAL_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_LOCAL_URL is required to seed local textbook data.');
}

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS textbook_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject varchar(20) NOT NULL,
  unit_number integer NOT NULL,
  unit_name varchar(50) NOT NULL,
  text_payload text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject, unit_number)
);

CREATE TABLE IF NOT EXISTS textbook_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES textbook_units(id) ON DELETE CASCADE,
  concept_name varchar(200) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (unit_id, concept_name)
);

CREATE TABLE IF NOT EXISTS textbook_summation_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES textbook_units(id) ON DELETE CASCADE,
  card_index integer NOT NULL,
  title varchar(500),
  body text,
  key_concepts jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, card_index)
);

CREATE TABLE IF NOT EXISTS textbook_concept_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES textbook_units(id) ON DELETE CASCADE,
  concept_id varchar(50) NOT NULL,
  rank integer,
  name varchar(300),
  frequency real,
  sources jsonb,
  definition text,
  key_points jsonb,
  textbook_excerpt text,
  enriched_definition text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, concept_id)
);

ALTER TABLE textbook_concept_cards
  ADD COLUMN IF NOT EXISTS real_question jsonb,
  ADD COLUMN IF NOT EXISTS caution text,
  ADD COLUMN IF NOT EXISTS quiz jsonb;

CREATE TABLE IF NOT EXISTS textbook_frequencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES textbook_units(id) ON DELETE CASCADE,
  frequency_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id)
);

CREATE TABLE IF NOT EXISTS quiz_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject varchar(20) NOT NULL,
  unit_number integer NOT NULL,
  cache_type varchar(20) NOT NULL,
  quiz_count integer NOT NULL,
  data jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject, unit_number, cache_type, quiz_count)
);
`;

type SubjectSource = {
  subject: 'sungjik' | 'kongil';
  rawFolder: string;
  cardsFolder: string;
};

const SUBJECTS: SubjectSource[] = [
  { subject: 'sungjik', rawFolder: 'sungjik', cardsFolder: 'success_cards_moi' },
  { subject: 'kongil', rawFolder: 'kongil', cardsFolder: 'kongil_cards_moi' },
];

function numericFiles(directory: string, pattern: RegExp): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((file) => pattern.test(file))
    .sort((a, b) => Number(a.match(pattern)?.[1]) - Number(b.match(pattern)?.[1]));
}

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function extractSummationBody(content: any): string {
  const parts = [
    content.description,
    content.body,
    content.integrated_data?.table,
    content.integrated_data?.logic_flow,
    content.integrated_data?.visual_analysis,
    Array.isArray(content.bullet_points)
      ? content.bullet_points.map((point: string) => `- ${point}`).join('\n')
      : '',
    Array.isArray(content.trap_points) && content.trap_points.length
      ? `주의: ${content.trap_points.join(', ')}`
      : '',
  ];
  return parts.filter(Boolean).join('\n\n');
}

async function upsertUnit(
  client: Client,
  subject: string,
  unitNumber: number,
  textPayload: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO textbook_units (subject, unit_number, unit_name, text_payload)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (subject, unit_number)
     DO UPDATE SET unit_name = EXCLUDED.unit_name, text_payload = EXCLUDED.text_payload
     RETURNING id`,
    [subject, unitNumber, `${unitNumber}단원`, textPayload],
  );
  return result.rows[0].id;
}

async function seedSubject(client: Client, source: SubjectSource) {
  const rawDirectory = path.join(ROOT, 'textbook', source.rawFolder);
  const rawFiles = numericFiles(rawDirectory, /^Unit_(\d+)\.txt$/);
  let seededUnits = 0;

  for (const file of rawFiles) {
    const unitNumber = Number(file.match(/^Unit_(\d+)\.txt$/)?.[1]);
    const unitId = await upsertUnit(
      client,
      source.subject,
      unitNumber,
      fs.readFileSync(path.join(rawDirectory, file), 'utf8'),
    );
    seededUnits++;

    const paddedUnit = String(unitNumber).padStart(2, '0');
    const conceptPath = path.join(
      ROOT,
      'textbook',
      'concepts',
      source.rawFolder,
      `Unit_${paddedUnit}.json`,
    );
    if (fs.existsSync(conceptPath)) {
      const concepts = readJson(conceptPath).concepts ?? [];
      for (const [sortOrder, conceptName] of concepts.entries()) {
        await client.query(
          `INSERT INTO textbook_concepts (unit_id, concept_name, sort_order)
           VALUES ($1, $2, $3)
           ON CONFLICT (unit_id, concept_name)
           DO UPDATE SET sort_order = EXCLUDED.sort_order`,
          [unitId, conceptName, sortOrder],
        );
      }
    }

    const summationPath = path.join(
      ROOT,
      'textbook',
      `${source.rawFolder}_summation`,
      `${unitNumber}단원.md`,
    );
    if (fs.existsSync(summationPath)) {
      const rawSummation = fs
        .readFileSync(summationPath, 'utf8')
        .replace(/^```json\s*/, '')
        .replace(/\s*```\s*$/, '');
      const cards = JSON.parse(rawSummation).cards ?? [];
      for (const [cardIndex, card] of cards.entries()) {
        const content = card.content ?? {};
        await client.query(
          `INSERT INTO textbook_summation_cards (unit_id, card_index, title, body, key_concepts)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (unit_id, card_index)
           DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body,
                         key_concepts = EXCLUDED.key_concepts`,
          [
            unitId,
            cardIndex,
            content.title ?? null,
            extractSummationBody(content),
            JSON.stringify(content.key_concepts ?? content.tags ?? []),
          ],
        );
      }
    }

    const cardPath = path.join(
      ROOT,
      'textbook',
      source.cardsFolder,
      `${unitNumber}단원.json`,
    );
    if (fs.existsSync(cardPath)) {
      const concepts = readJson(cardPath).concepts ?? [];
      for (const concept of concepts) {
        await client.query(
           `INSERT INTO textbook_concept_cards
              (unit_id, concept_id, rank, name, frequency, sources, definition,
               key_points, textbook_excerpt, enriched_definition, real_question,
               caution, quiz)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10,
                    $11::jsonb, $12, $13::jsonb)
            ON CONFLICT (unit_id, concept_id)
            DO UPDATE SET rank = EXCLUDED.rank, name = EXCLUDED.name,
                          frequency = EXCLUDED.frequency, sources = EXCLUDED.sources,
                          definition = EXCLUDED.definition, key_points = EXCLUDED.key_points,
                          textbook_excerpt = EXCLUDED.textbook_excerpt,
                          enriched_definition = EXCLUDED.enriched_definition,
                          real_question = EXCLUDED.real_question,
                          caution = EXCLUDED.caution, quiz = EXCLUDED.quiz`,
          [
            unitId,
            concept.id,
            concept.rank ?? null,
            concept.name ?? null,
            concept.frequency ?? null,
            JSON.stringify(concept.sources ?? []),
            concept.card?.definition ?? null,
            JSON.stringify(concept.card?.keyPoints ?? []),
            concept.card?.textbookExcerpt ?? null,
            concept.card?.enrichedDefinition ?? null,
            JSON.stringify(concept.realQuestion ?? null),
            concept.caution ?? null,
            JSON.stringify(concept.quiz ?? []),
          ],
        );
      }
    }

    const frequencyPath = path.join(
      ROOT,
      'textbook',
      `${source.rawFolder}_frequency`,
      `${unitNumber}단원.json`,
    );
    if (fs.existsSync(frequencyPath)) {
      await client.query(
        `INSERT INTO textbook_frequencies (unit_id, frequency_data)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (unit_id)
         DO UPDATE SET frequency_data = EXCLUDED.frequency_data`,
        [unitId, JSON.stringify(readJson(frequencyPath))],
      );
    }
  }

  console.log(`Seeded ${source.subject}: ${seededUnits} units`);
}

async function seedQuizCaches(client: Client, source: SubjectSource) {
  const cacheDirectory = path.join(
    ROOT,
    'textbook',
    `${source.rawFolder}_summation`,
    'cache',
  );
  const cacheFiles = numericFiles(cacheDirectory, /^(\d+)_(blank|concept)_(10|20)\.json$/);

  for (const file of cacheFiles) {
    const [, unitNumber, cacheType, quizCount] = file.match(
      /^(\d+)_(blank|concept)_(10|20)\.json$/,
    )!;
    await client.query(
      `INSERT INTO quiz_cache (subject, unit_number, cache_type, quiz_count, data)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (subject, unit_number, cache_type, quiz_count)
       DO UPDATE SET data = EXCLUDED.data, generated_at = now()`,
      [
        source.subject,
        Number(unitNumber),
        cacheType,
        Number(quizCount),
        JSON.stringify(readJson(path.join(cacheDirectory, file))),
      ],
    );
  }

  console.log(`Seeded ${source.subject}: ${cacheFiles.length} quiz caches`);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(SCHEMA);
    for (const source of SUBJECTS) {
      await seedSubject(client, source);
      await seedQuizCaches(client, source);
    }
    await client.query('COMMIT');
    console.log('Local textbook data seed completed.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

void main();
