import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import 'dotenv/config';
import { writeReferenceLiveQaArtifact } from './reference-live-qa-artifact';

const baseUrl = process.env.REFERENCE_LIVE_QA_URL ?? 'http://localhost:3001';
const databaseUrl = process.env.DATABASE_URL;
const marker = `reference-live-qa-${randomUUID()}`;
const email = `${marker}@example.test`;
const password = 'ReferenceQa!!2026';
let jobId: string | undefined;
let headers: Readonly<Record<string, string>> | undefined;

const LIVE_QA_ARCHETYPES = {
  table: {
    subjectSlug: 'success',
    unitNumber: 15,
    sourceIds: ['success:15:\uc131\uc9c1_15\ub2e8\uc6d0_\ubb38\uc81c.pdf:1'],
  },
  case_calculation: {
    subjectSlug: 'success',
    unitNumber: 15,
    sourceIds: ['success:15:\uc131\uc9c1_15\ub2e8\uc6d0_\ubb38\uc81c.pdf:2'],
  },
  timeline_process: {
    subjectSlug: 'success',
    unitNumber: 15,
    sourceIds: ['success:15:\uc131\uc9c1_15\ub2e8\uc6d0_\ubb38\uc81c.pdf:3'],
  },
  statute_application: {
    subjectSlug: 'success',
    unitNumber: 15,
    sourceIds: ['success:15:\uc131\uc9c1_15\ub2e8\uc6d0_\ubb38\uc81c.pdf:4'],
  },
  incident_report: {
    subjectSlug: 'industry',
    unitNumber: 15,
    sourceIds: ['kongil:15:\uacf5\uc77c_15\ub2e8\uc6d0_\ubb38\uc81c.pdf:1'],
  },
  inspection_checklist: {
    subjectSlug: 'industry',
    unitNumber: 15,
    sourceIds: ['kongil:15:\uacf5\uc77c_15\ub2e8\uc6d0_\ubb38\uc81c.pdf:2'],
  },
  shared_document_set: {
    subjectSlug: 'industry',
    unitNumber: 15,
    sourceIds: [
      'kongil:15:\uacf5\uc77c_15\ub2e8\uc6d0_\ubb38\uc81c.pdf:3',
      'kongil:15:\uacf5\uc77c_15\ub2e8\uc6d0_\ubb38\uc81c.pdf:4',
    ],
  },
} as const;

type LiveQaArchetype = keyof typeof LIVE_QA_ARCHETYPES;
type LiveQaEvidence = Readonly<{
  sourceId: string;
  sourceHash: string;
  outputHash: string;
  archetype: LiveQaArchetype;
  template: string;
  itemCount: number;
  contractVersion: number;
  deterministic: 'passed';
  copyPolicy: 'passed';
  verifierModel: string;
  verifierVerdict: 'accepted';
  verifierReasonCode: string;
  retryCount: number;
}>;
type PersistedStructuralRow = Readonly<{
  sourceId: string;
  sourceHash: string;
  outputHash: string;
  template: string;
  selectedTemplate: string;
  sourceTemplate: string;
  shellPresent: boolean;
  evidenceBlockCount: number;
  choiceTopology: string;
  distractorCount: number;
  setRequired: boolean;
  setPosition: string;
  stimulusPresent: boolean;
  optionCount: number;
  contractVersion: number;
  deterministic: 'passed';
  copyPolicy: 'passed';
  verifierModel: string;
  verifierVerdict: 'accepted';
  verifierReasonCode: string;
  retryCount: number;
}>;
type CleanupReceipt = Readonly<{
  users: number;
  exams: number;
  questions: number;
  notifications: number;
  refreshTokens: number;
  job: 'not_created' | 'removed' | 'retained_nonterminal';
}>;

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

function psqlScalar(
  sql: string,
  variables: Readonly<Record<string, string>>,
): string {
  const result = psql(sql, variables).trim();
  if (result.length === 0) {
    throw new Error('Expected a database value.');
  }
  return result;
}

function isLiveQaArchetype(value: string): value is LiveQaArchetype {
  return Object.hasOwn(LIVE_QA_ARCHETYPES, value);
}

function requestedArchetype(): LiveQaArchetype {
  const value = process.env.REFERENCE_LIVE_QA_ARCHETYPE;
  if (value === undefined || !isLiveQaArchetype(value)) {
    throw new Error(
      `REFERENCE_LIVE_QA_ARCHETYPE must be one of: ${Object.keys(LIVE_QA_ARCHETYPES).join(', ')}`,
    );
  }
  return value;
}

function parseCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Expected a non-negative database count.');
  }
  return count;
}

function parseBoolean(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Expected a database boolean.');
}

function parseStructuralRows(
  output: string,
): readonly PersistedStructuralRow[] {
  const lines = output
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);
  return lines.map((line) => {
    const fields = line.split('\t');
    if (fields.length !== 20)
      throw new Error('Unexpected persisted evidence shape.');
    const [
      sourceId,
      template,
      selectedTemplate,
      sourceTemplate,
      shellPresent,
      evidenceBlockCount,
      choiceTopology,
      distractorCount,
      setRequired,
      setPosition,
      stimulusPresent,
      optionCount,
      sourceHash,
      outputHash,
      contractVersion,
      deterministic,
      copyPolicy,
      verifierModel,
      verifierVerdict,
      verifierReasonCode,
      retryCount,
    ] = fields;
    if (
      sourceId === undefined ||
      template === undefined ||
      selectedTemplate === undefined ||
      sourceTemplate === undefined ||
      shellPresent === undefined ||
      evidenceBlockCount === undefined ||
      choiceTopology === undefined ||
      distractorCount === undefined ||
      setRequired === undefined ||
      setPosition === undefined ||
      stimulusPresent === undefined ||
      optionCount === undefined ||
      sourceHash === undefined ||
      outputHash === undefined ||
      contractVersion === undefined ||
      deterministic !== 'passed' ||
      copyPolicy !== 'passed' ||
      verifierModel === undefined ||
      verifierVerdict !== 'accepted' ||
      verifierReasonCode === undefined ||
      retryCount === undefined
    ) {
      throw new Error('Unexpected persisted evidence fields.');
    }
    return {
      sourceId,
      template,
      selectedTemplate,
      sourceTemplate,
      shellPresent: parseBoolean(shellPresent),
      evidenceBlockCount: parseCount(evidenceBlockCount),
      choiceTopology,
      distractorCount: parseCount(distractorCount),
      setRequired: parseBoolean(setRequired),
      setPosition,
      stimulusPresent: parseBoolean(stimulusPresent),
      optionCount: parseCount(optionCount),
      sourceHash,
      outputHash,
      contractVersion: parseCount(contractVersion),
      deterministic,
      copyPolicy,
      verifierModel,
      verifierVerdict,
      verifierReasonCode,
      retryCount: parseCount(retryCount),
    };
  });
}

function safeFailureDetail(detail: string | undefined): string {
  if (detail === undefined) return 'detail=absent';
  const codes = [...new Set(detail.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [])];
  const availableReferenceCount = /"availableReferenceCount":(\d+)/.exec(
    detail,
  )?.[1];
  const validationPath = /"path":"([^"]+)"/.exec(detail)?.[1];
  const summary =
    codes.length === 0
      ? `detail_length=${detail.length}`
      : `codes=${codes.join(',')}`;
  const withAvailableReferences =
    availableReferenceCount === undefined
      ? summary
      : `${summary},available_references=${availableReferenceCount}`;
  return validationPath === undefined
    ? withAvailableReferences
    : `${withAvailableReferences},path=${validationPath}`;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function main(): Promise<void> {
  const archetype = requestedArchetype();
  const configuration = LIVE_QA_ARCHETYPES[archetype];
  const subjectId = psqlScalar(
    `SELECT id FROM subjects WHERE slug = :'subject_slug';`,
    { subject_slug: configuration.subjectSlug },
  );
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
      startUnitNum: configuration.unitNumber,
      endUnitNum: configuration.unitNumber,
      difficulty: 'MIDDLE',
      questionCount: configuration.sourceIds.length,
      sourceType: 'reference',
      referenceSourceIds: configuration.sourceIds,
    }),
  });
  jobId = job.jobId;

  const deadline = Date.now() + 180_000;
  let completed:
    | {
        status: string;
        examId?: string;
        logs?: Array<{ detail?: string }>;
        request?: { referenceSourceIds?: readonly string[] };
      }
    | undefined;
  while (Date.now() < deadline) {
    completed = await json<{
      status: string;
      examId?: string;
      logs?: Array<{ detail?: string }>;
      request?: { referenceSourceIds?: readonly string[] };
    }>(`/exams/jobs/${job.jobId}`, { headers });
    if (completed.status !== 'running') break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  if (completed?.status !== 'completed' || completed.examId === undefined) {
    const requestSourceIds = completed?.request?.referenceSourceIds;
    const sourceFilterRetained =
      requestSourceIds !== undefined &&
      requestSourceIds.length === configuration.sourceIds.length &&
      requestSourceIds.every(
        (sourceId, index) => sourceId === configuration.sourceIds[index],
      );
    throw new Error(
      `Reference job did not complete: ${completed?.status ?? 'timeout'} source_filter=${sourceFilterRetained ? 'retained' : 'lost'} ${safeFailureDetail(completed?.logs?.at(-1)?.detail)}`,
    );
  }
  const structuralRows = parseStructuralRows(
    psql(
      `
        SELECT concat_ws(E'\\t',
          q.generation_lineage #>> '{source,sourceId}',
          q.recommended_template,
          q.generation_lineage ->> 'selectedTemplate',
          q.generation_lineage #>> '{archetype,sourceTemplate}',
          (jsonb_typeof(q.generation_lineage #> '{archetype,shell}') = 'object')::text,
          jsonb_array_length(COALESCE(q.generation_lineage #> '{frame,structureBlueprint,evidenceBlocks}', '[]'::jsonb))::text,
          q.generation_lineage #>> '{archetype,choiceTopology}',
          jsonb_array_length(COALESCE(q.generation_lineage #> '{payload,distractorAxes}', '[]'::jsonb))::text,
          COALESCE(q.generation_lineage #>> '{archetype,setStructure,required}', 'false'),
          COALESCE(q.generation_lineage #>> '{archetype,setStructure,position}', ''),
           (jsonb_typeof(q.stimulus_data) = 'object')::text,
           jsonb_array_length(q.options_list)::text,
           q.generation_lineage #>> '{fidelity,sourceHash}',
           md5(q.question_stem || q.stimulus_data::text || q.options_list::text),
           q.generation_lineage #>> '{fidelity,contractVersion}',
           q.generation_lineage #>> '{fidelity,receipt,deterministic}',
           q.generation_lineage #>> '{fidelity,receipt,copyPolicy}',
           q.generation_lineage #>> '{fidelity,receipt,semanticVerifier,model}',
           q.generation_lineage #>> '{fidelity,receipt,semanticVerifier,verdict}',
           q.generation_lineage #>> '{fidelity,receipt,semanticVerifier,reasonCode}',
           q.generation_lineage #>> '{fidelity,receipt,retryCount}'
        )
        FROM exam_items AS item
        JOIN questions AS q ON q.id = item.question_id
        WHERE item.exam_id = :'exam_id'
        ORDER BY item.order_index;
      `,
      { exam_id: completed.examId },
    ),
  );
  if (structuralRows.length !== configuration.sourceIds.length) {
    throw new Error(
      'Expected the requested number of persisted reference items.',
    );
  }
  const sourceIds = new Set<string>(configuration.sourceIds);
  for (const row of structuralRows) {
    if (
      !sourceIds.has(row.sourceId) ||
      row.template !== row.selectedTemplate ||
      row.template !== row.sourceTemplate ||
      !row.shellPresent ||
      row.evidenceBlockCount === 0 ||
      row.choiceTopology.length === 0 ||
      row.distractorCount === 0 ||
      !row.stimulusPresent ||
      row.optionCount !== 5
    ) {
      throw new Error(
        'Persisted reference structure did not satisfy the QA contract.',
      );
    }
  }
  if (
    archetype === 'shared_document_set' &&
    (!structuralRows.every((row) => row.setRequired) ||
      new Set(structuralRows.map((row) => row.setPosition)).size !== 2)
  ) {
    throw new Error('Shared-document set linkage was not retained.');
  }
  for (const row of structuralRows) {
    const evidence: LiveQaEvidence = {
      sourceId: row.sourceId,
      sourceHash: row.sourceHash,
      outputHash: row.outputHash,
      archetype,
      template: row.template,
      itemCount: structuralRows.length,
      contractVersion: row.contractVersion,
      deterministic: row.deterministic,
      copyPolicy: row.copyPolicy,
      verifierModel: row.verifierModel,
      verifierVerdict: row.verifierVerdict,
      verifierReasonCode: row.verifierReasonCode,
      retryCount: row.retryCount,
    };
    console.log(JSON.stringify(evidence));
  }
  const artifact = writeReferenceLiveQaArtifact(
    process.env.REFERENCE_LIVE_QA_ARTIFACT_DIR ??
      '../.omo/evidence/reference-live',
    {
      fixtureId: archetype,
      sourceHashes: structuralRows.map((row) => row.sourceHash),
      outputHashes: structuralRows.map((row) => row.outputHash),
      deterministic: 'passed',
      copyPolicy: 'passed',
      semanticVerifier: {
        models: [...new Set(structuralRows.map((row) => row.verifierModel))],
        verdict: 'accepted',
        reasonCodes: [
          ...new Set(structuralRows.map((row) => row.verifierReasonCode)),
        ],
      },
      retryCounts: structuralRows.map((row) => row.retryCount),
      status: 'passed',
    },
  );
  console.log(JSON.stringify({ artifact }));
}

async function cleanup(): Promise<void> {
  let job: CleanupReceipt['job'] = 'not_created';
  if (jobId !== undefined && headers !== undefined) {
    try {
      await json<{ removed: boolean }>(`/exams/jobs/${jobId}`, {
        method: 'DELETE',
        headers,
      });
      job = 'removed';
    } catch {
      job = 'retained_nonterminal';
    }
  }
  const output = psql(
    `
      BEGIN;
      CREATE TEMP TABLE qa_users ON COMMIT DROP AS
      SELECT id FROM users WHERE email = :'email';
      CREATE TEMP TABLE qa_exams ON COMMIT DROP AS
      SELECT id FROM exam_records WHERE user_id IN (SELECT id FROM qa_users);
      CREATE TEMP TABLE qa_questions ON COMMIT DROP AS
      SELECT DISTINCT question_id AS id FROM exam_items
      WHERE exam_id IN (SELECT id FROM qa_exams);
      SELECT concat_ws(E'\\t',
        (SELECT count(*) FROM qa_users),
        (SELECT count(*) FROM qa_exams),
        (SELECT count(*) FROM qa_questions),
        (SELECT count(*) FROM notifications WHERE user_id IN (SELECT id FROM qa_users)),
        (SELECT count(*) FROM refresh_tokens WHERE user_id IN (SELECT id FROM qa_users))
      );
      DELETE FROM incorrect_records
      WHERE user_id IN (SELECT id FROM qa_users)
         OR question_id IN (SELECT id FROM qa_questions);
      DELETE FROM flagged_questions
      WHERE user_id IN (SELECT id FROM qa_users)
         OR question_id IN (SELECT id FROM qa_questions);
      DELETE FROM exam_items WHERE exam_id IN (SELECT id FROM qa_exams);
      DELETE FROM exam_tags WHERE exam_id IN (SELECT id FROM qa_exams);
      DELETE FROM exam_records WHERE id IN (SELECT id FROM qa_exams);
      DELETE FROM questions WHERE id IN (SELECT id FROM qa_questions);
      DELETE FROM notifications WHERE user_id IN (SELECT id FROM qa_users);
      DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM qa_users);
      DELETE FROM users WHERE id IN (SELECT id FROM qa_users);
      COMMIT;
    `,
    { email },
  ).trim();
  const counts = output.split('\t');
  if (counts.length !== 5 || counts.some((count) => count === undefined)) {
    throw new Error('Unexpected cleanup receipt shape.');
  }
  const receipt: CleanupReceipt = {
    users: parseCount(counts[0] ?? ''),
    exams: parseCount(counts[1] ?? ''),
    questions: parseCount(counts[2] ?? ''),
    notifications: parseCount(counts[3] ?? ''),
    refreshTokens: parseCount(counts[4] ?? ''),
    job,
  };
  console.log(JSON.stringify({ cleanup: receipt }));
}

async function run(): Promise<void> {
  if (process.env.REFERENCE_LIVE_QA !== '1') {
    console.log(
      JSON.stringify({
        status: 'skipped',
        reason: 'REFERENCE_LIVE_QA_NOT_ENABLED',
      }),
    );
    return;
  }
  try {
    await main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : 'Live QA failed.');
    process.exitCode = 1;
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
