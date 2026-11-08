import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { parseReference } from '../src/exams/reference-selector.utils';
import {
  sourcePreservingRender,
  sourceTemplate,
} from '../src/exams/simply-reference-source-preserving.adapter';
import type { SubjectStyle } from '../src/exams/reference-frame.types';
import { SOURCE_BLOCKS_TPL } from '../src/exams/source-blocks-stimulus';

// v2(DB 스냅샷)와 v3(built) 행이 학생 시험 생성 경로(parseReference → 원형 분류 → source-preserving 렌더)를
// 어떻게 통과하는지 비교한다. DB 접근 없음.
// usage: node -r ts-node/register scripts/audit-reference-v3-rendering.ts

type Row = {
  logical_source_id: string;
  subject: string;
  unit_number: number;
  unit_numbers: number[];
  source_payload: Record<string, unknown> & { source?: Record<string, unknown> };
};

const v3Root = path.resolve(__dirname, '../../artifacts/reference-corpus-v3');

function subjectStyle(subject: string): SubjectStyle {
  return (subject === 'kongil' ? 'kongil' : 'success') as SubjectStyle;
}

// stringOnly: v3 구조화 블록을 떼고 기존 문자열 어댑터만 탔을 때의 결과(비교용).
function outcome(row: Row, stringOnly = false): string {
  const payload: Record<string, unknown> = {
    ...row.source_payload,
    source: { ...(row.source_payload.source ?? {}) },
  };
  if (stringOnly) delete payload.stimulusBlocks;
  const parsed = parseReference(payload, subjectStyle(row.subject));
  if (!parsed.ok) return 'parse_rejected';
  if (sourceTemplate(parsed.value) === null) return 'no_template';
  const render = sourcePreservingRender(parsed.value);
  if (render === null) return 'render_failed';
  const primary = sourceTemplate(parsed.value);
  if (render.template === SOURCE_BLOCKS_TPL) return `ok:${SOURCE_BLOCKS_TPL}`;
  return render.template === primary ? `ok:${render.template}` : `fallback:${primary}->${render.template}`;
}

function tally(rows: readonly Row[], stringOnly = false): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = outcome(row, stringOnly);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Map([...counts].sort((a, b) => b[1] - a[1]));
}

function main(): void {
  const v3Rows = readdirSync(path.join(v3Root, 'built'))
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => JSON.parse(readFileSync(path.join(v3Root, 'built', name), 'utf8')) as Row[])
    .filter((row) => row.unit_number !== null);
  const v2Ids = new Set(
    v3Rows.flatMap((row) => ((row.source_payload.extraction as { v2LogicalSourceIds?: string[] })?.v2LogicalSourceIds ?? [])),
  );
  const v2Rows = (JSON.parse(readFileSync(path.join(v3Root, 'v2-snapshot.json'), 'utf8')) as Row[]).filter((row) =>
    v2Ids.has(row.logical_source_id),
  );
  console.log(`same questions: v2 ${v2Rows.length} rows, v3 ${v3Rows.length} rows`);
  console.log('v2', Object.fromEntries(tally(v2Rows)));
  console.log('v3 (string adapter only)', Object.fromEntries(tally(v3Rows, true)));
  console.log('v3', Object.fromEntries(tally(v3Rows)));
  const figures = v3Rows.flatMap((row) =>
    Array.isArray(row.source_payload.figures) ? (row.source_payload.figures as { url?: unknown }[]) : [],
  );
  const uploaded = figures.filter((figure) => typeof figure.url === 'string').length;
  console.log(
    `v3 ${SOURCE_BLOCKS_TPL}: ${v3Rows.filter((row) => outcome(row) === `ok:${SOURCE_BLOCKS_TPL}`).length}/${v3Rows.length} rows, figures with url ${uploaded}/${figures.length}`,
  );
  const failures = v3Rows.filter((row) => !outcome(row).startsWith('ok:'));
  for (const row of failures.slice(0, 40)) console.log(`  ${outcome(row)}  ${row.logical_source_id}`);
}

main();
