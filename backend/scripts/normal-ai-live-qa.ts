import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const baseUrl = process.env.REFERENCE_LIVE_QA_URL ?? 'http://localhost:3001';
const databaseUrl = process.env.DATABASE_URL;
const marker = `normal-ai-live-qa-${randomUUID()}`;
const email = `${marker}@example.test`;
const password = 'NormalAiQa!!2026';
const subjectSlug = 'success';
const unitNumber = 15;
const questionCount = 10;
const jobTimeoutMs = 600_000;
const pollIntervalMs = 2_000;

type Headers = Readonly<Record<string, string>>;
type QuestionReport = Readonly<{
  ordinal: number;
  template: string;
  itemType: string;
  stemPreview: string;
  optionCount: number;
  correctAnswerIndex: number;
  generationStatus: 'completed';
}>;
type PersistedQuestionRow = QuestionReport &
  Readonly<{
    sourceType: string;
    startUnitNumber: number;
    endUnitNumber: number;
    unitNumber: number;
    hasNoReferenceLineage: boolean;
  }>;
type CleanupCounts = Readonly<{
  users: number;
  exams: number;
  questionLinks: number;
  newQuestions: number;
  notifications: number;
  refreshTokens: number;
}>;
type CleanupReceipt = Readonly<{
  job: 'not_created' | 'removed' | 'retained_terminal' | 'retained_nonterminal';
  removed: CleanupCounts;
  residual: CleanupCounts;
}>;
type JobState = Readonly<{
  status: string;
  examId: string | undefined;
  request: Readonly<Record<string, unknown>> | undefined;
}>;

class LiveQaFailure extends Error {
  readonly name = 'LiveQaFailure';
}

let jobId: string | undefined;
let headers: Headers | undefined;
let jobIsTerminal = false;
let existingQuestionIds = new Set<string>();

function psql(
  sql: string,
  variables: Readonly<Record<string, string>> = {},
): string {
  if (databaseUrl === undefined) {
    throw new LiveQaFailure('DATABASE_URL is required.');
  }
  const query = sql.replace(/:'([a-z_]+)'/g, (token, key: string) => {
    const value = variables[key];
    if (value === undefined) {
      throw new LiveQaFailure(`Missing SQL variable: ${key}`);
    }
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

function psqlScalar(
  sql: string,
  variables: Readonly<Record<string, string>>,
): string {
  const result = psql(sql, variables).trim();
  if (result.length === 0) {
    throw new LiveQaFailure('Expected a database value.');
  }
  return result;
}

function parseCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new LiveQaFailure('Expected a non-negative database count.');
  }
  return count;
}

function parseBoolean(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new LiveQaFailure('Expected a database boolean.');
}

function record(
  value: unknown,
  context: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LiveQaFailure(`Expected an object for ${context}.`);
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = item;
  }
  return result;
}

function requiredString(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const result = value[key];
  if (typeof result !== 'string' || result.length === 0) {
    throw new LiveQaFailure(`Expected a string for ${key}.`);
  }
  return result;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) {
    throw new LiveQaFailure(`${path} returned HTTP ${response.status}.`);
  }
  return response.json();
}

function parseJobState(payload: unknown): JobState {
  const value = record(payload, 'job response');
  const rawExamId = value.examId;
  if (rawExamId !== undefined && typeof rawExamId !== 'string') {
    throw new LiveQaFailure('Expected examId to be a string when present.');
  }
  const rawRequest = value.request;
  return {
    status: requiredString(value, 'status'),
    examId: rawExamId,
    request:
      rawRequest === undefined ? undefined : record(rawRequest, 'job request'),
  };
}

function parseQuestionRows(output: string): readonly PersistedQuestionRow[] {
  const lines = output
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);
  return lines.map((line) => {
    const fields = line.split('\t');
    if (fields.length !== 11) {
      throw new LiveQaFailure('Unexpected persisted question evidence shape.');
    }
    const [
      ordinal,
      template,
      itemType,
      stemPreview,
      optionCount,
      correctAnswerIndex,
      sourceType,
      startUnitNumber,
      endUnitNumber,
      persistedUnitNumber,
      hasNoReferenceLineage,
    ] = fields;
    if (
      ordinal === undefined ||
      template === undefined ||
      itemType === undefined ||
      stemPreview === undefined ||
      optionCount === undefined ||
      correctAnswerIndex === undefined ||
      sourceType === undefined ||
      startUnitNumber === undefined ||
      endUnitNumber === undefined ||
      persistedUnitNumber === undefined ||
      hasNoReferenceLineage === undefined
    ) {
      throw new LiveQaFailure('Unexpected persisted question evidence fields.');
    }
    return {
      ordinal: parseCount(ordinal),
      template,
      itemType,
      stemPreview,
      optionCount: parseCount(optionCount),
      correctAnswerIndex: parseCount(correctAnswerIndex),
      generationStatus: 'completed',
      sourceType,
      startUnitNumber: parseCount(startUnitNumber),
      endUnitNumber: parseCount(endUnitNumber),
      unitNumber: parseCount(persistedUnitNumber),
      hasNoReferenceLineage: parseBoolean(hasNoReferenceLineage),
    };
  });
}

function parseCleanupCounts(output: string): CleanupCounts {
  const fields = output.trim().split('\t');
  if (fields.length !== 6) {
    throw new LiveQaFailure('Unexpected cleanup receipt shape.');
  }
  const [
    users,
    exams,
    questionLinks,
    newQuestions,
    notifications,
    refreshTokens,
  ] = fields;
  if (
    users === undefined ||
    exams === undefined ||
    questionLinks === undefined ||
    newQuestions === undefined ||
    notifications === undefined ||
    refreshTokens === undefined
  ) {
    throw new LiveQaFailure('Unexpected cleanup receipt fields.');
  }
  return {
    users: parseCount(users),
    exams: parseCount(exams),
    questionLinks: parseCount(questionLinks),
    newQuestions: parseCount(newQuestions),
    notifications: parseCount(notifications),
    refreshTokens: parseCount(refreshTokens),
  };
}

function questionIdVariables(
  ids: readonly string[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    ids.map((id, index) => [`question_id_${index}`, id]),
  );
}

function questionIdList(ids: readonly string[]): string {
  return ids.map((_, index) => `:'question_id_${index}'`).join(', ');
}

async function main(): Promise<void> {
  if (process.env.NORMAL_AI_LIVE_QA !== '1') {
    throw new LiveQaFailure('Set NORMAL_AI_LIVE_QA=1 to run live provider QA.');
  }

  existingQuestionIds = new Set(
    psql('SELECT id FROM questions;')
      .trim()
      .split('\n')
      .filter((id) => id.length > 0),
  );
  const subjectId = psqlScalar(
    `SELECT id FROM subjects WHERE slug = :'subject_slug';`,
    { subject_slug: subjectSlug },
  );
  const passwordHash = await bcrypt.hash(password, 10);
  psql(
    `INSERT INTO users (email, name, password_hash, birthday) VALUES (:'email', :'marker', :'password_hash', '2000-01-01');`,
    { email, marker, password_hash: passwordHash },
  );

  const login = record(
    await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
    'login response',
  );
  headers = {
    Authorization: `Bearer ${requiredString(login, 'accessToken')}`,
    'Content-Type': 'application/json',
  };

  const job = record(
    await request('/exams/jobs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        subjectId,
        startUnitNum: unitNumber,
        endUnitNum: unitNumber,
        difficulty: 'MIDDLE',
        questionCount,
        sourceType: 'ai',
      }),
    }),
    'job creation response',
  );
  jobId = requiredString(job, 'jobId');

  const deadline = Date.now() + jobTimeoutMs;
  let completed: JobState | undefined;
  while (Date.now() < deadline) {
    completed = parseJobState(
      await request(`/exams/jobs/${jobId}`, { headers }),
    );
    if (completed.status === 'completed' || completed.status === 'failed') {
      jobIsTerminal = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  if (completed?.status !== 'completed' || completed.examId === undefined) {
    const status = completed?.status ?? 'timeout';
    throw new LiveQaFailure(`Normal AI job did not complete: ${status}.`);
  }
  if (
    completed.request?.sourceType !== 'ai' ||
    Object.hasOwn(completed.request, 'referenceSourceIds')
  ) {
    throw new LiveQaFailure('Normal AI job request contract was not retained.');
  }

  const rows = parseQuestionRows(
    psql(
      `
        SELECT concat_ws(E'\\t',
          item.order_index::text,
          q.recommended_template,
          q.item_type,
          left(btrim(regexp_replace(q.question_stem, '[[:space:]]+', ' ', 'g')), 120),
          jsonb_array_length(q.options_list)::text,
          q.correct_answer::text,
          exam.source_type,
          exam.start_unit_num::text,
          exam.end_unit_num::text,
          unit.unit_number::text,
          (q.generation_lineage IS NULL)::text
        )
        FROM exam_items AS item
        JOIN exam_records AS exam ON exam.id = item.exam_id
        JOIN questions AS q ON q.id = item.question_id
        JOIN units AS unit ON unit.id = q.unit_id
        WHERE item.exam_id = :'exam_id'
          AND exam.user_id = (SELECT id FROM users WHERE email = :'email')
          AND exam.subject_id = :'subject_id'
        ORDER BY item.order_index;
      `,
      { exam_id: completed.examId, email, subject_id: subjectId },
    ),
  );
  if (rows.length !== questionCount) {
    throw new LiveQaFailure(
      `Expected exactly ${questionCount} persisted questions.`,
    );
  }
  for (const [index, row] of rows.entries()) {
    if (
      row.ordinal !== index + 1 ||
      row.sourceType !== 'ai' ||
      row.startUnitNumber !== unitNumber ||
      row.endUnitNumber !== unitNumber ||
      row.unitNumber !== unitNumber ||
      !row.hasNoReferenceLineage
    ) {
      throw new LiveQaFailure(
        'Persisted normal AI question contract was not satisfied.',
      );
    }
  }
  for (const row of rows) {
    const report: QuestionReport = {
      ordinal: row.ordinal,
      template: row.template,
      itemType: row.itemType,
      stemPreview: row.stemPreview,
      optionCount: row.optionCount,
      correctAnswerIndex: row.correctAnswerIndex,
      generationStatus: row.generationStatus,
    };
    console.log(JSON.stringify({ question: report }));
  }
}

async function cleanup(): Promise<void> {
  let job: CleanupReceipt['job'] = 'not_created';
  if (jobId !== undefined && headers !== undefined) {
    if (!jobIsTerminal) {
      job = 'retained_nonterminal';
    } else {
      try {
        await request(`/exams/jobs/${jobId}`, { method: 'DELETE', headers });
        job = 'removed';
      } catch {
        job = 'retained_terminal';
      }
    }
  }

  const linkedQuestionIds = psql(
    `
      SELECT DISTINCT item.question_id
      FROM exam_items AS item
      JOIN exam_records AS exam ON exam.id = item.exam_id
      WHERE exam.user_id = (SELECT id FROM users WHERE email = :'email');
    `,
    { email },
  )
    .trim()
    .split('\n')
    .filter((id) => id.length > 0);
  const newQuestionIds = linkedQuestionIds.filter(
    (id) => !existingQuestionIds.has(id),
  );
  const idVariables = questionIdVariables(newQuestionIds);
  const newQuestionDelete =
    newQuestionIds.length === 0
      ? ''
      : `DELETE FROM questions WHERE id IN (${questionIdList(newQuestionIds)});`;
  const removed = parseCleanupCounts(
    psql(
      `
        BEGIN;
        CREATE TEMP TABLE qa_users ON COMMIT DROP AS
        SELECT id FROM users WHERE email = :'email';
        CREATE TEMP TABLE qa_exams ON COMMIT DROP AS
        SELECT id FROM exam_records WHERE user_id IN (SELECT id FROM qa_users);
        CREATE TEMP TABLE qa_question_links ON COMMIT DROP AS
        SELECT DISTINCT question_id AS id FROM exam_items
        WHERE exam_id IN (SELECT id FROM qa_exams);
        SELECT concat_ws(E'\\t',
          (SELECT count(*) FROM qa_users),
          (SELECT count(*) FROM qa_exams),
          (SELECT count(*) FROM qa_question_links),
          ${newQuestionIds.length},
          (SELECT count(*) FROM notifications WHERE user_id IN (SELECT id FROM qa_users)),
          (SELECT count(*) FROM refresh_tokens WHERE user_id IN (SELECT id FROM qa_users))
        );
        DELETE FROM incorrect_records WHERE user_id IN (SELECT id FROM qa_users);
        DELETE FROM flagged_questions WHERE user_id IN (SELECT id FROM qa_users);
        DELETE FROM exam_items WHERE exam_id IN (SELECT id FROM qa_exams);
        DELETE FROM exam_tags WHERE exam_id IN (SELECT id FROM qa_exams);
        DELETE FROM exam_records WHERE id IN (SELECT id FROM qa_exams);
        ${newQuestionDelete}
        DELETE FROM notifications WHERE user_id IN (SELECT id FROM qa_users);
        DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM qa_users);
        DELETE FROM users WHERE id IN (SELECT id FROM qa_users);
        COMMIT;
      `,
      { email, ...idVariables },
    ),
  );
  const residual = parseCleanupCounts(
    psql(
      `
        SELECT concat_ws(E'\\t',
          (SELECT count(*) FROM users WHERE email = :'email'),
          (SELECT count(*) FROM exam_records
            WHERE user_id IN (SELECT id FROM users WHERE email = :'email')),
          (SELECT count(*) FROM exam_items
            WHERE exam_id IN (SELECT id FROM exam_records
              WHERE user_id IN (SELECT id FROM users WHERE email = :'email'))),
          ${newQuestionIds.length === 0 ? '0' : `(SELECT count(*) FROM questions WHERE id IN (${questionIdList(newQuestionIds)}))`},
          (SELECT count(*) FROM notifications
            WHERE user_id IN (SELECT id FROM users WHERE email = :'email')),
          (SELECT count(*) FROM refresh_tokens
            WHERE user_id IN (SELECT id FROM users WHERE email = :'email'))
        );
      `,
      { email, ...idVariables },
    ),
  );
  if (Object.values(residual).some((count) => count !== 0)) {
    throw new LiveQaFailure('QA cleanup left persisted records.');
  }
  const receipt: CleanupReceipt = { job, removed, residual };
  console.log(JSON.stringify({ cleanup: receipt }));
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error: unknown) {
    process.exitCode = 1;
    console.error(
      error instanceof LiveQaFailure
        ? error.message
        : 'Normal AI live QA failed before completion.',
    );
  } finally {
    try {
      await cleanup();
    } catch {
      process.exitCode = 1;
      console.error(JSON.stringify({ cleanup: 'failed' }));
    }
  }
}

void run();
