import 'dotenv/config';
import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

function norm(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, '').replace(/^\d+\./, '').replace(/\[?\d+점\]?$/, '');
}

function loadParsed() {
  const entries: Array<{ subj: string; kind: string; f: string; q: Record<string, unknown> }> = [];
  for (const subj of ['sungjik', 'kongil']) {
    for (const kind of ['moi', 'suteck']) {
      const d = path.join(ROOT, 'textbook', 'parsed', subj, kind);
      if (!existsSync(d)) continue;
      for (const f of readdirSync(d).filter((x) => x.endsWith('.json'))) {
        for (const q of JSON.parse(readFileSync(path.join(d, f), 'utf8'))) {
          entries.push({ subj, kind, f, q });
        }
      }
    }
  }
  return entries;
}

function buildPayload(
  q: Record<string, unknown>,
  subject: string,
) {
  const s = (q.source as Record<string, unknown>) || {};
  const unit = (q.unitNumber ?? s.unitNumber) as number;
  const fn = (s.filename as string) || '';
  return {
    source: {
      type: (s.type as string) || 'moi',
      subject,
      subjectKor: subject === 'success' ? '성공적인 직업생활' : '공업 일반',
      unitNumber: unit,
      year: s.year,
      examType: s.examType,
      filename: fn,
    },
    questionNumber: q.questionNumber,
    stem: (q.stem as string) || '',
    stimulus: (q.stimulus as string) || '',
    viewItems: (q.viewItems as string[]) || [],
    choices: (q.choices as string[]) || [],
    correctAnswer: q.correctAnswer,
    targetConcepts: (q.targetConcepts as string[]) || [],
  };
}

async function main() {
  const local = loadParsed();
  const c = new Client({ connectionString: process.env.DATABASE_SUPABASE_URL, statement_timeout: 30000 });
  await c.connect();

  const { rows } = await c.query(
    'select logical_source_id, subject, unit_number, source_payload, content_hash from reference_questions',
  );

  const backups: unknown[] = [];
  const repairs: Array<{ id: string; subject: string; unit: number; payload: unknown; hash: string }> = [];

  for (const r of rows) {
    const p = (r.source_payload as Record<string, unknown>) || {};
    const s = (p.source as Record<string, unknown>) || {};
    const sub = r.subject === 'success' ? 'sungjik' : 'kongil';

    const cand = local.filter(
      (x) =>
        x.subj === sub &&
        (x.q.source as Record<string,unknown> | null)?.filename === s.filename &&
        x.q.questionNumber === p.questionNumber,
    );
    const q = cand.find((x) => norm(x.q.stem) === norm(p.stem))?.q;
    if (!q) continue;

    const ls = String(q.stimulus || '');
    const ds = String(p.stimulus || '');
    // loki: got content but DB truncated by 30%+
    if (ls.length < 80 || ds.length >= ls.length * 0.7) continue;

    const np = buildPayload(q, r.subject);
    if (!np.stimulus || np.stimulus.length <= ds.length) continue;
    if (!np.choices || np.choices.length !== 5) continue;
    if (!Number.isInteger(np.correctAnswer) || (np.correctAnswer as number) < 1 || (np.correctAnswer as number) > 5) continue;

    const h = 'sha256:' + createHash('sha256').update(JSON.stringify(np)).digest('hex');
    if (h === r.content_hash) continue;

    backups.push(r);
    repairs.push({ id: r.logical_source_id, subject: r.subject, unit: r.unit_number, payload: np, hash: h });
  }

  console.log({ candidates: repairs.length, samples: repairs.slice(0, 5).map((x) => x.id) });

  const bp = path.join(
    ROOT,
    `artifacts/reference-repair-parsed-backup-${new Date().toISOString().replaceAll(':', '-')}.json`,
  );
  writeFileSync(bp, JSON.stringify(backups, null, 2));

  if (!repairs.length) {
    console.log('no repairs needed');
    await c.end();
    return;
  }

  await c.query('begin');
  try {
    let n = 0;
    for (const x of repairs) {
      await c.query(
        'update reference_questions set content_hash=$1, source_payload=$2::jsonb where logical_source_id=$3',
        [x.hash, JSON.stringify(x.payload), x.id],
      );
      n++;
    }
    await c.query('commit');
    console.log({ repaired: n, backup: bp });
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
