import { readFile } from 'node:fs/promises';
import { aiQuestionFingerprint } from '../src/exams/ai-question-generation.service';
import type {
  AiQuestionBlueprint,
  AiQuestionCandidate,
} from '../src/exams/ai-blueprint.types';
import { materializeAiQuestion } from '../src/exams/ai-question-materializer';
import { validateAiQuestion } from '../src/exams/ai-question-validator';

type ShadowCase = Readonly<{
  blueprint: AiQuestionBlueprint;
  candidate: AiQuestionCandidate;
  model?: string;
  attempt?: number;
}>;

type ShadowReport = Readonly<{
  total: number;
  materialized: number;
  accepted: number;
  rejected: number;
  duplicateCount: number;
  failureCodes: Readonly<Record<string, number>>;
  byTemplate: Readonly<Record<string, { total: number; accepted: number }>>;
  byTemplateModelAttempt: Readonly<Record<string, { total: number; accepted: number; rejected: number; rejectionCodes: Readonly<Record<string, number>> }>>;
}>;

async function main(): Promise<void> {
  const input = option('--input');
  if (input === undefined) {
    throw new Error(
      'Usage: npm run shadow:ai -- --input=corpus.json [--format=json]',
    );
  }
  const parsed: unknown = JSON.parse(await readFile(input, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error('Shadow corpus must be an array.');
  }
  const cases = parsed as ShadowCase[];
  const report = evaluate(cases);
  process.stdout.write(
    option('--format') === 'json'
      ? JSON.stringify(report, null, 2)
      : renderMarkdown(report),
  );
  process.stdout.write('\n');
}

function evaluate(cases: readonly ShadowCase[]): ShadowReport {
  const failureCodes: Record<string, number> = {};
  const byTemplate: Record<string, { total: number; accepted: number }> = {};
  const byTemplateModelAttempt: Record<string, { total: number; accepted: number; rejected: number; rejectionCodes: Record<string, number> }> = {};
  const fingerprints = new Set<string>();
  let materialized = 0;
  let accepted = 0;
  let duplicateCount = 0;
  for (const item of cases) {
    const template = item.blueprint.template;
    const model = item.model ?? item.candidate.telemetry?.model ?? 'unknown';
    const attempt = item.attempt ?? 1;
    const detailKey = `${template}:${model}:attempt-${attempt}`;
    const detail = (byTemplateModelAttempt[detailKey] ??= { total: 0, accepted: 0, rejected: 0, rejectionCodes: {} });
    detail.total += 1;
    const bucket = (byTemplate[template] ??= { total: 0, accepted: 0 });
    bucket.total += 1;
    const materializedResult = materializeAiQuestion(
      item.blueprint,
      item.candidate,
    );
    if (materializedResult.kind === 'rejected') {
      increment(failureCodes, materializedResult.code);
      detail.rejected += 1;
      increment(detail.rejectionCodes, materializedResult.code);
      continue;
    }
    materialized += 1;
    const validation = validateAiQuestion(
      item.blueprint,
      item.candidate,
      materializedResult.question,
    );
    if (!validation.passed) {
      const code = validation.failureCode ?? 'UNKNOWN';
      increment(failureCodes, code);
      detail.rejected += 1;
      increment(detail.rejectionCodes, code);
      continue;
    }
    const fingerprint = aiQuestionFingerprint(materializedResult.question);
    if (fingerprints.has(fingerprint)) {
      duplicateCount += 1;
      increment(failureCodes, 'AI_DUPLICATE_REJECTED');
      detail.rejected += 1;
      increment(detail.rejectionCodes, 'AI_DUPLICATE_REJECTED');
      continue;
    }
    fingerprints.add(fingerprint);
    accepted += 1;
    bucket.accepted += 1;
    detail.accepted += 1;
  }
  return {
    total: cases.length,
    materialized,
    accepted,
    rejected: cases.length - accepted,
    duplicateCount,
    failureCodes,
    byTemplate,
    byTemplateModelAttempt,
  };
}

function renderMarkdown(report: ShadowReport): string {
  const acceptanceRate =
    report.total === 0 ? 0 : (report.accepted / report.total) * 100;
  return [
    '# AI shadow evaluation',
    `- total: ${report.total}`,
    `- materialized: ${report.materialized}`,
    `- accepted: ${report.accepted}`,
    `- rejected: ${report.rejected}`,
    `- acceptance rate: ${acceptanceRate.toFixed(2)}%`,
    `- duplicates: ${report.duplicateCount}`,
    '',
    '## failure codes',
    ...Object.entries(report.failureCodes).map(
      ([code, count]) => `- ${code}: ${count}`,
    ),
    '',
    '## templates',
    ...Object.entries(report.byTemplate).map(
      ([template, counts]) =>
        `- ${template}: ${counts.accepted}/${counts.total} accepted`,
    ),
    '',
    '## template/model/attempt',
    ...Object.entries(report.byTemplateModelAttempt).map(
      ([key, counts]) => `- ${key}: ${counts.accepted}/${counts.total} accepted; rejected ${counts.rejected} (${Object.entries(counts.rejectionCodes).map(([code, count]) => `${code}=${count}`).join(', ') || '-'})`,
    ),
  ].join('\n');
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function option(name: string): string | undefined {
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

void main();
