import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const baseUrl = process.env.REFERENCE_LIVE_QA_URL ?? 'http://localhost:3001';
const databaseUrl = process.env.DATABASE_URL;
const marker = `ai-unit-qa-${randomUUID()}`;
const email = `${marker}@example.test`;
const password = 'AiUnitQa!!2026';
let jobId: string | undefined;
let headers: Readonly<Record<string, string>> | undefined;

function psql(
  sql: string,
  variables: Readonly<Record<string, string>> = {},
): string {
  if (databaseUrl === undefined) throw new Error('DATABASE_URL is required.');
  const query = sql.replace(/:'([a-z_]+)'/g, (token, key: string) => {
    const value = variables[key];
    if (value === undefined) throw new Error(`Missing SQL variable: ${key}`);
    return `'${value.replaceAll("'", "''")}'`;
  });
  return execFileSync(
    'psql',
    [
      databaseUrl,
      '-v',
      'ON_ERROR_STOP=1',
      '--quiet',
      '--tuples-only',
      '--no-align',
      '-c',
      query,
    ],
    { encoding: 'utf8' },
  );
}

function scalar(
  sql: string,
  variables: Readonly<Record<string, string>>,
): string {
  const value = psql(sql, variables).trim();
  if (value.length === 0) throw new Error('Expected a database value.');
  return value;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}

function count(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error('Invalid cleanup count.');
  return parsed;
}

function safeFailureDetail(detail: string | undefined): string {
  if (detail === undefined) return 'detail=absent';
  const codes = [...new Set(detail.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [])];
  const path = /"path":"([^"]+)"/.exec(detail)?.[1];
  const summary = `codes=${codes.join(',')}; detail=${JSON.stringify(detail.slice(0, 300))}`;
  return path === undefined ? summary : `${summary},path=${path}`;
}

async function main(): Promise<void> {
  const subjectId = scalar(`SELECT id FROM subjects WHERE slug = :'slug';`, {
    slug: 'success',
  });
  const passwordHash = await bcrypt.hash(password, 10);
  psql(
    `INSERT INTO users (email, name, password_hash, birthday) VALUES (:'email', :'marker', :'password_hash', '2000-01-01');`,
    { email, marker, password_hash: passwordHash },
  );
  const login = await json<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  headers = {
    Authorization: `Bearer ${login.accessToken}`,
    'Content-Type': 'application/json',
  };
  const job = await json<{ jobId: string }>('/exams/jobs', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      subjectId,
      startUnitNum: 15,
      endUnitNum: 15,
      difficulty: 'MIDDLE',
      questionCount: 10,
      sourceType: 'ai',
    }),
  });
  jobId = job.jobId;
  const deadline = Date.now() + 600_000;
  let completed:
    | { status: string; examId?: string; logs?: Array<{ detail?: string }> }
    | undefined;
  while (Date.now() < deadline) {
    completed = await json<{
      status: string;
      examId?: string;
      logs?: Array<{ detail?: string }>;
    }>(`/exams/jobs/${jobId}`, { headers });
    if (completed.status !== 'running') break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  if (
    completed === undefined ||
    completed.status !== 'completed' ||
    completed.examId === undefined
  ) {
    throw new Error(
      `AI job did not complete: ${completed?.status ?? 'timeout'}; ${safeFailureDetail(completed?.logs?.at(-1)?.detail)}`,
    );
  }
  const examId = completed.examId;
  const rows = psql(
    `SELECT concat_ws(E'\\t', item.order_index::text, COALESCE(q.recommended_template, ''), left(regexp_replace(q.stem, E'[\\n\\r\\t]+', ' ', 'g'), 120), jsonb_array_length(q.options_list)::text, q.correct_answer::text)
     FROM exam_items AS item JOIN questions AS q ON q.id = item.question_id
     WHERE item.exam_id = :'exam_id' ORDER BY item.order_index;`,
    { exam_id: examId },
  )
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);
  if (rows.length !== 10)
    throw new Error(
      `Expected 10 persisted questions, received ${rows.length}.`,
    );
  for (const row of rows) {
    const [order, template, stemPreview, optionCount, correctAnswer] =
      row.split('\t');
    if (
      order === undefined ||
      template === undefined ||
      stemPreview === undefined ||
      optionCount === undefined ||
      correctAnswer === undefined
    )
      throw new Error('Unexpected question report shape.');
    console.log(
      JSON.stringify({
        order: Number(order),
        template: template || 'plain',
        stemPreview,
        optionCount: Number(optionCount),
        correctAnswer: Number(correctAnswer),
      }),
    );
  }
}

async function cleanup(): Promise<void> {
  let job = 'not_created';
  if (jobId !== undefined && headers !== undefined) {
    try {
      await json(`/exams/jobs/${jobId}`, { method: 'DELETE', headers });
      job = 'removed';
    } catch {
      job = 'retained_nonterminal';
    }
  }
  const output = psql(
    `BEGIN;
     CREATE TEMP TABLE qa_users ON COMMIT DROP AS SELECT id FROM users WHERE email = :'email';
     CREATE TEMP TABLE qa_exams ON COMMIT DROP AS SELECT id FROM exam_records WHERE user_id IN (SELECT id FROM qa_users);
     CREATE TEMP TABLE qa_questions ON COMMIT DROP AS SELECT DISTINCT question_id AS id FROM exam_items WHERE exam_id IN (SELECT id FROM qa_exams);
     SELECT concat_ws(E'\\t', (SELECT count(*) FROM qa_users), (SELECT count(*) FROM qa_exams), (SELECT count(*) FROM qa_questions), (SELECT count(*) FROM notifications WHERE user_id IN (SELECT id FROM qa_users)), (SELECT count(*) FROM refresh_tokens WHERE user_id IN (SELECT id FROM qa_users)));
     DELETE FROM incorrect_records WHERE user_id IN (SELECT id FROM qa_users) OR question_id IN (SELECT id FROM qa_questions);
     DELETE FROM flagged_questions WHERE user_id IN (SELECT id FROM qa_users) OR question_id IN (SELECT id FROM qa_questions);
     DELETE FROM exam_items WHERE exam_id IN (SELECT id FROM qa_exams);
     DELETE FROM exam_tags WHERE exam_id IN (SELECT id FROM qa_exams);
     DELETE FROM exam_records WHERE id IN (SELECT id FROM qa_exams);
     DELETE FROM questions WHERE id IN (SELECT id FROM qa_questions);
     DELETE FROM notifications WHERE user_id IN (SELECT id FROM qa_users);
     DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM qa_users);
     DELETE FROM users WHERE id IN (SELECT id FROM qa_users);
     COMMIT;`,
    { email },
  )
    .trim()
    .split('\t');
  if (output.length !== 5) throw new Error('Unexpected cleanup receipt shape.');
  console.log(
    JSON.stringify({
      cleanup: {
        users: count(output[0] ?? ''),
        exams: count(output[1] ?? ''),
        questions: count(output[2] ?? ''),
        notifications: count(output[3] ?? ''),
        refreshTokens: count(output[4] ?? ''),
        job,
      },
    }),
  );
}

void (async () => {
  try {
    await main();
  } catch (error: unknown) {
    console.error(
      error instanceof Error ? error.message : 'AI unit QA failed.',
    );
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
})();
