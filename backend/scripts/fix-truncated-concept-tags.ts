import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// ponytail: concepts/*/Unit_NN.json의 태그명이 ',' '·' '('로 잘려 있음(과거 varchar 절단).
// 각 과목의 frequency 파일 전체 이름으로 복원. 대상: 개념 원본 + 오프라인 JSON + Supabase textbook_concepts.
const ROOT = path.resolve(__dirname, '..', '..');
const TEXTBOOK = path.join(ROOT, 'textbook');

function normalize(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/[\s·()（）\-_/.,，:：]+/gu, '');
}
function isTruncated(s: string): boolean {
  return /[,(·]$/.test(s);
}

// concepts/{folder}/Unit_NN.json의 잘린 태그 → 같은 단원 {folder}_frequency 전체 이름
function truncatedToFull(folder: string): Map<string, string> {
  const result = new Map<string, string>();
  for (let u = 1; u <= 20; u++) {
    const f = path.join(TEXTBOOK, 'concepts', folder, `Unit_${String(u).padStart(2, '0')}.json`);
    if (!fs.existsSync(f)) continue;
    const freqFile = path.join(TEXTBOOK, `${folder}_frequency`, `${u}단원.json`);
    if (!fs.existsSync(freqFile)) continue;
    const fulls = (JSON.parse(fs.readFileSync(freqFile, 'utf8')).concepts ?? [])
      .map((c: any) => String(c.name ?? ''));
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const tag of data.concepts ?? []) {
      if (!isTruncated(tag)) continue;
      const t = normalize(tag);
      const cand = fulls.filter((full) => { const n = normalize(full); return n.startsWith(t) && n.length > t.length; });
      if (cand.length === 1) result.set(tag, cand[0]);
      else console.warn(`⚠️ 매핑 실패: ${folder} ${u}단원 ${tag} → 후보 ${cand.length}개`);
    }
  }
  return result;
}

function patchFile(file: string, map: Map<string, string>): number {
  if (!fs.existsSync(file)) return 0;
  const raw = fs.readFileSync(file, 'utf8');
  let patched = raw;
  let count = 0;
  for (const [trunc, full] of map) {
    const before = patched;
    patched = patched.split(JSON.stringify(trunc)).join(JSON.stringify(full));
    if (patched !== before) count++;
  }
  if (patched !== raw) fs.writeFileSync(file, patched);
  return count;
}

async function main() {
  const maps = new Map<string, Map<string, string>>();
  for (const folder of ['sungjik', 'kongil']) {
    maps.set(folder, truncatedToFull(folder));
  }
  const total = [...maps.values()].reduce((sum, m) => sum + m.size, 0);
  if (total === 0) { console.log('매핑 없음 — 종료'); return; }
  for (const [folder, m] of maps) {
    console.log(`\n[${folder}] ${m.size}개:`);
    for (const [t, f] of m) console.log(`  ${t}\n    → ${f}`);
  }

  let patchedFiles = 0;
  for (const folder of ['sungjik', 'kongil']) {
    const m = maps.get(folder)!;
    for (let u = 1; u <= 20; u++) {
      const f = path.join(TEXTBOOK, 'concepts', folder, `Unit_${String(u).padStart(2, '0')}.json`);
      if (patchFile(f, m)) patchedFiles++;
    }
  }
  const offlineMap = new Map([...maps.get('sungjik')!, ...maps.get('kongil')!]);
  for (const [subj, folder] of [['success', 'sungjik'], ['industry', 'kongil']] as const) {
    for (const name of ['all-concept-tags-offline.json', 'concept-tags-offline.json']) {
      const f = path.join(TEXTBOOK, '_v2', 'rebuild', subj, name);
      if (patchFile(f, maps.get(folder)!)) patchedFiles++;
    }
  }
  console.log(`\n파일 패치: ${patchedFiles}개`);

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  let dbUpdated = 0;
  for (const [trunc, full] of offlineMap) {
    const { error } = await supabase
      .from('textbook_concepts')
      .update({ concept_name: full })
      .eq('concept_name', trunc);
    if (error) { console.warn(`  ❌ ${trunc}: ${error.message}`); continue; }
    dbUpdated++;
  }
  console.log(`Supabase textbook_concepts 갱신: ${dbUpdated}행`);
}

main().catch((err) => { console.error(err); process.exit(1); });
