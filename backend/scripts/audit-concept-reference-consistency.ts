import 'dotenv/config';

type Row = {
  subject: string;
  unit_number: number;
  name: string;
  real_question: Record<string, any> | null;
};

type ReferenceRow = {
  logical_source_id: string;
  subject: string;
  unit_number: number;
  source_payload: Record<string, any>;
};

type QueryResult<T> = { rows: T[] };
type Client = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<T>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
};

const { Client: PgClient } = require('pg') as { Client: new (options: { connectionString: string; ssl: { rejectUnauthorized: boolean } }) => Client };

async function main(): Promise<void> {
  const client = new PgClient({
    connectionString: requiredDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const subjects = subjectFilter();
    const [cards, references] = await Promise.all([
      client.query<Row>(
        `SELECT u.subject, u.unit_number, c.name, c.real_question
         FROM textbook_concept_cards c
         JOIN textbook_units u ON u.id = c.unit_id
         WHERE u.subject = ANY($1::text[])
         ORDER BY u.subject, u.unit_number, c.rank NULLS LAST, c.name`,
        [subjects],
      ),
      client.query<ReferenceRow>(
        `SELECT logical_source_id, subject, unit_number, source_payload
         FROM reference_questions
         WHERE subject = ANY($1::text[])
         ORDER BY subject, unit_number, logical_source_id`,
        [subjects],
      ),
    ]);

    const mismatches = cards.rows.flatMap((card) => {
      const current = currentReference(card, references.rows);
      const best = references.rows
        .filter((reference) => subjectMatches(reference.subject, card.subject) && reference.unit_number === card.unit_number)
        .map((reference) => ({ reference, score: matchScore(card.name, targetConcepts(reference)) }))
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score)[0];
      if (best === undefined || best.score <= (current?.score ?? 0) + 20) return [];
      return [{
        subject: card.subject,
        unitNumber: card.unit_number,
        concept: card.name,
        currentSourceId: current?.reference.logical_source_id ?? null,
        currentTargets: current?.targets ?? [],
        suggestedSourceId: best.reference.logical_source_id,
        suggestedTargets: targetConcepts(best.reference),
        scoreGap: best.score - (current?.score ?? 0),
      }];
    });

    console.log(JSON.stringify({
      cards: cards.rows.length,
      references: references.rows.length,
      mismatches: mismatches.length,
      items: mismatches,
    }, null, 2));
  } finally {
    await client.end();
  }
}

function currentReference(card: Row, references: readonly ReferenceRow[]) {
  const question = card.real_question?.questionData ?? card.real_question;
  const number = Number(question?.number ?? question?.metadata?.question_number);
  const source = String(question?.source_exam ?? question?.metadata?.source_exam ?? '').trim();
  const stem = String(question?.stem ?? question?.render_ready?.question_stem ?? '').trim();
  if (!Number.isInteger(number) || source === '') return undefined;
  const reference = references.find((candidate) => {
    if (!subjectMatches(candidate.subject, card.subject) || candidate.unit_number !== card.unit_number) return false;
    const payload = candidate.source_payload;
    const candidateSource = String(
      payload.source?.filename ?? payload.source?.examType ?? '',
    );
    return Number(payload.questionNumber) === number &&
      (sameSource(source, candidateSource, payload.source?.year) ||
        sameText(stem, String(payload.stem ?? '')));
  });
  return reference === undefined
    ? undefined
    : { reference, targets: targetConcepts(reference), score: matchScore(card.name, targetConcepts(reference)) };
}

function sameSource(left: string, right: string, year: unknown): boolean {
  if (left.includes(right) || right.includes(left)) return true;
  const leftYears: string[] = left.match(/20\d{2}/gu) ?? [];
  const rightYear = typeof year === 'number' ? String(year) : right.match(/20\d{2}/u)?.[0];
  if (rightYear === undefined || !leftYears.includes(rightYear)) return false;
  return ['수능', '모의평가', '모의고사', '수능특강'].some((label) => left.includes(label) || right.includes(label));
}

function sameText(left: string, right: string): boolean {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return normalizedLeft.length >= 12 &&
    normalizedRight.length >= 12 &&
    (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft));
}

function targetConcepts(reference: ReferenceRow): string[] {
  const targets = reference.source_payload.targetConcepts;
  return Array.isArray(targets) ? targets.filter((value): value is string => typeof value === 'string') : [];
}

function subjectMatches(left: string, right: string): boolean {
  return (left === 'success' || left === 'sungjik') && (right === 'success' || right === 'sungjik')
    || (left === 'industry' || left === 'kongil') && (right === 'industry' || right === 'kongil');
}

function matchScore(cardName: string, targets: readonly string[]): number {
  const card = normalize(cardName);
  return Math.max(0, ...targets.map((target) => {
    const candidate = normalize(target);
    if (candidate === card) return 100;
    if (candidate.includes(card) || card.includes(candidate)) return 80;
    const cardWords = new Set(cardName.split(/\s+/u).filter((word) => word.length > 1));
    const shared = target.split(/\s+/u).filter((word) => word.length > 1 && cardWords.has(word)).length;
    return shared > 0 ? shared * 15 : 0;
  }));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s·()（）\-_/]+/gu, '');
}

function subjectFilter(): readonly string[] {
  const value = process.argv.find((argument) => argument.startsWith('--subject='))?.split('=')[1];
  if (value === 'success') return ['success', 'sungjik'];
  if (value === 'industry') return ['industry', 'kongil'];
  return ['success', 'sungjik', 'industry', 'kongil'];
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
