/**
 * Repair reference_questions against the GAP canonical parsed corpus.
 *
 * Selection rule (per user decision):
 *   - 기출메이크(현재 DB payload)는 "축약 안 됐고 TPL 안 깨진 경우"만 선택
 *   - 그 외에는 GAP canonical (textbook/parsed) 텍스트로 교체
 *   - 둘 다 TPL이 깨지면 GAP 텍스트 기준 + tpl_broken 리스트로 분리(LLM 변환 대상)
 *
 * Merged payload fields:
 *   stem/stimulus/viewItems      ← 선택된 소스
 *   choices/correctAnswer/targetConcepts/explanation/generatedExplanation/
 *   conceptHighlightsV2/conceptHighlightV2/source/provenance  ← 현재 DB 보존
 *   tplStimulusData              ← Phase 2에서 채움 (여기서는 계산만 리포트)
 *
 * Usage:
 *   npx ts-node scripts/repair-reference-v2-from-gap.ts            # dry-run
 *   npx ts-node scripts/repair-reference-v2-from-gap.ts --apply    # DB 반영
 */

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { parseReference } from '../src/exams/reference-selector.utils';
import { sourceTemplate, sourcePreservingRender } from '../src/exams/simply-reference-source-preserving.adapter';

const ROOT = path.resolve(__dirname, '../..');
const TRUNC_RATIO = 0.7;

type Json = Record<string, unknown>;
type DbRow = { id: string; logical_source_id: string; subject: string; source_payload: Json; content_hash: string };
type Canonical = { q: Json; source: Json; subject: 'sungjik' | 'kongil'; dir: string };

function normStem(s: unknown): string {
  return String(s ?? '')
    .replace(/[～〜–—]/g, '~')
    .replace(/[○◯△□▽◇]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^가-힣a-zA-Z0-9~()]/g, '')
    .replace(/^\d+/, '')
    .replace(/\(\)/g, '');
}

function loadCanonical(): Map<string, Canonical[]> {
  const map = new Map<string, Canonical[]>();
  for (const subject of ['sungjik', 'kongil'] as const) {
    for (const dir of ['moi', 'suteck', 'all']) {
      const directory = path.join(ROOT, 'textbook/parsed', subject, dir);
      let files: string[] = [];
      try { files = readdirSync(directory); } catch { continue; }
      for (const f of files.filter((x) => x.endsWith('.json'))) {
        const items = JSON.parse(readFileSync(path.join(directory, f), 'utf8')) as Json[];
        for (const q of items) {
          const source = (q.source as Json) ?? {};
          const key = `${subject}|${source.filename}|${q.questionNumber}`;
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push({ q, source, subject, dir });
        }
      }
    }
  }
  return map;
}

function buildGapPayload(canonical: Canonical, dbSubject: string): Json {
  const q = canonical.q;
  const s = canonical.source;
  const unit = (q.unitNumber ?? s.unitNumber) as number;
  return {
    source: {
      type: s.type ?? 'moi',
      subject: dbSubject,
      subjectKor: dbSubject === 'success' ? '성공적인 직업생활' : '공업 일반',
      unitNumber: unit,
      year: s.year,
      examType: s.examType,
      filename: s.filename,
    },
    questionNumber: q.questionNumber,
    stem: String(q.stem ?? ''),
    stimulus: String(q.stimulus ?? ''),
    viewItems: Array.isArray(q.viewItems) ? q.viewItems : [],
    choices: Array.isArray(q.choices) ? q.choices : [],
    correctAnswer: q.correctAnswer,
    targetConcepts: Array.isArray(q.targetConcepts) ? q.targetConcepts : [],
  };
}

function tplState(payload: Json, subject: string): 'ok' | 'broken' | 'unparseable' {
  const ref = parseReference(payload, subject as 'success' | 'kongil');
  if (!ref.ok) return 'unparseable';
  const target = sourceTemplate(ref.value);
  if (target === null) return 'unparseable';
  const render = sourcePreservingRender(ref.value);
  if (render === null) return 'broken';
  return render.template === target ? 'ok' : 'broken';
}

function isTruncated(dbStim: string, gapStim: string): boolean {
  if (gapStim.length < 80) return dbStim.length < gapStim.length;
  return dbStim.length < gapStim.length * TRUNC_RATIO;
}

function searchable(payload: Json): string {
  return `${String(payload.stimulus ?? '')}\n${Array.isArray(payload.viewItems) ? (payload.viewItems as string[]).join('\n') : ''}`;
}

function brokenQuotes(payload: Json): string[] {
  const hl = payload.conceptHighlightsV2;
  if (!hl || typeof hl !== 'object') return [];
  const text = searchable(payload);
  const broken: string[] = [];
  for (const [concept, value] of Object.entries(hl as Json)) {
    const clues = (value as Json)?.stimulusClues;
    if (!Array.isArray(clues)) { broken.push(concept); continue; }
    for (const clue of clues) {
      const quote = (clue as Json)?.quote;
      if (typeof quote !== 'string' || !text.includes(quote)) { broken.push(concept); break; }
    }
  }
  return broken;
}

function hash(payload: Json): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

function toGichulRow(row: DbRow, payload: Json, contentHash: string): Json {
  return {
    logicalSourceId: row.logical_source_id,
    contentHash,
    subject: row.subject,
    unitNumber: ((payload.source as Json)?.unitNumber as number) ?? 0,
    unitNumbers: [((payload.source as Json)?.unitNumber as number) ?? 0],
    provenancePath: String((payload.source as Json)?.filename ?? row.logical_source_id),
    parseVersion: 'reference-pdf-v2',
    sourcePayload: payload,
    status: 'certified',
    validationErrors: [],
  };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_SUPABASE_URL;
  if (!url) throw new Error('DATABASE_SUPABASE_URL required');
  const apply = process.argv.includes('--apply');

  const canonical = loadCanonical();
  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<DbRow & { parse_version: string }>(
    'select id, logical_source_id, subject, source_payload, content_hash, parse_version from reference_questions',
  );

  const report: { mode: string; decisions: Record<string, number>; counts: Record<string, number>; rows: Json[] } = {
    mode: apply ? 'apply' : 'dry-run',
    decisions: {},
    counts: {},
    rows: [],
  };
  const counts: Record<string, number> = {};
  const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };

  const updated: Array<{ id: string; payload: Json; hash: string }> = [];
  const applied: Json[] = [];
  const repairedRows: Json[] = [];

  for (const row of rows) {
    const p = row.source_payload;
    const s = (p.source as Json) ?? {};
    const subject = row.subject === 'success' ? 'sungjik' : 'kongil';
    const entry: Json = { logicalSourceId: row.logical_source_id };

    if (!s.filename || !p.questionNumber) {
      entry.decision = 'NO_SOURCE_KEY'; bump('NO_SOURCE_KEY');
      report.rows.push(entry);
      repairedRows.push(toGichulRow(row, p, hash(p)));
      continue;
    }
    const candidates = canonical.get(`${subject}|${s.filename}|${p.questionNumber}`) ?? [];
    // 같은 파일+문항번호의 후보가 moi/suteck/all에 중복 저장됨 → 정규화 stem으로 그룹핑해 중복 제거
    const unique = [...new Map(
      candidates.map((c) => [normStem(c.q.stem), c]),
    ).values()].sort((a, b) => String(b.q.stimulus ?? '').length - String(a.q.stimulus ?? '').length);
    const exact = unique.find((c) => normStem(c.q.stem) === normStem(p.stem));
    const gap = exact ?? (unique.length === 1 ? unique[0] : undefined);

    if (gap === undefined) {
      entry.decision = candidates.length === 0 ? 'NO_MATCH' : 'STEM_AMBIGUOUS';
      bump(entry.decision as string);
      report.rows.push(entry);
      repairedRows.push(toGichulRow(row, p, hash(p)));
      continue;
    }

    const gapPayload = buildGapPayload(gap, row.subject);
    const dbStim = String(p.stimulus ?? '');
    const gapStim = String(gapPayload.stimulus ?? '');
    const dbTpl = tplState(p, row.subject);
    const gapTpl = tplState(gapPayload, row.subject);
    const truncated = isTruncated(dbStim, gapStim);

    // 선택 규칙: 기출메이크는 축약 안 되고 TPL 안 깨진 경우만, 아니면 GAP
    let source: 'gichul' | 'gap';
    let decision: string;
    if (!truncated && dbTpl === 'ok') { source = 'gichul'; decision = 'GICHUL_OK'; }
    else if (gapTpl === 'ok') { source = 'gap'; decision = truncated ? 'GAP_TRUNCATED' : 'GAP_TPL_FIX'; }
    else { source = 'gap'; decision = 'TPL_BROKEN_BOTH'; }
    bump(decision);

    const merged: Json = {
      ...p,
      // stem은 DB 유지 (GAP stem에 "17." 등 표시용 번호 붙어있어 더러움)
      stem: p.stem,
      // GAP 원문이 비어있으면(공유지문 파생행) 기존 DB stimulus 유지
      stimulus: source === 'gap' && gapStim !== '' ? gapStim : p.stimulus,
      viewItems: source === 'gap' ? gapPayload.viewItems : p.viewItems,
    };

    const mergedTpl = tplState(merged, row.subject);
    const quoteBroken = brokenQuotes(merged);
    const changed =
      JSON.stringify(p.stimulus) !== JSON.stringify(merged.stimulus) ||
      JSON.stringify(p.viewItems) !== JSON.stringify(merged.viewItems) ||
      p.stem !== merged.stem;

    entry.decision = decision;
    entry.source = source;
    entry.truncated = truncated;
    entry.dbTpl = dbTpl;
    entry.gapTpl = gapTpl;
    entry.mergedTpl = mergedTpl;
    entry.dbLen = dbStim.length;
    entry.gapLen = gapStim.length;
    entry.quoteBroken = quoteBroken;
    entry.changed = changed;

    if (changed && mergedTpl !== 'unparseable') {
      // 결정#4: quote 깨지면 highlights 제거하고 텍스트는 수리(재생성은 P3)
      if (quoteBroken.length > 0) {
        delete merged.conceptHighlightsV2;
        delete merged.conceptHighlightV2;
        entry.highlightsRemoved = true;
        bump('QUOTE_BROKEN_REPAIRED');
      }
      const newHash = hash(merged);
      if (newHash !== row.content_hash) {
        updated.push({ id: row.id, payload: merged, hash: newHash });
        entry.updated = true;
      }
    }

    if (apply && entry.updated) applied.push(entry);
    report.rows.push(entry);

    const finalPayload = entry.updated === true ? merged : p;
    repairedRows.push(toGichulRow(row, finalPayload, hash(finalPayload)));
  }

  report.decisions = counts;
  report.counts = {
    rows: rows.length,
    willUpdate: updated.length,
    highlightsRemovedForRegen: (report.rows as Json[]).filter((r) => r.highlightsRemoved === true).length,
    tplBrokenRows: (report.rows as Json[]).filter((r) => r.decision === 'TPL_BROKEN_BOTH').length,
  };

  const outPath = path.join(ROOT, 'artifacts/reference-repair-v2-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  const rowsOutPath = path.join(ROOT, 'artifacts/reference-rows-repaired.json');
  writeFileSync(rowsOutPath, JSON.stringify(repairedRows, null, 2));

  if (apply) {
    const backupPath = path.join(ROOT, `artifacts/reference-repair-backup-${new Date().toISOString().replaceAll(':', '-')}.json`);
    writeFileSync(backupPath, JSON.stringify(rows, null, 2));
    await client.query('begin');
    try {
      for (const u of updated) {
        await client.query(
          'update reference_questions set content_hash=$1, source_payload=$2::jsonb where id=$3',
          [u.hash, JSON.stringify(u.payload), u.id],
        );
      }
      await client.query('commit');
      console.log(JSON.stringify({ mode: 'apply', updated: updated.length, backupPath }));
    } catch (e) {
      await client.query('rollback');
      throw e;
    }
  } else {
    console.log(JSON.stringify({ mode: 'dry-run', decisions: counts, willUpdate: updated.length, outPath }));
  }
  await client.end();
}

void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
