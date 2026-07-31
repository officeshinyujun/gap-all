/**
 * Extract answers from suteck 해설 PDFs and sync to Supabase.
 * Input: ~/Downloads/성직_답.pdf and ~/Downloads/공일_답.pdf
 */
import { execFileSync } from 'node:child_process';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';

interface Answer {
  qn: number;
  ans: number;
}

function extractAnswers(pdfPath: string): Answer[] {
  const text = execFileSync('pdftotext', ['-raw', pdfPath, '-']).toString(
    'utf8',
  );

  const allMatches: Array<{ idx: number; ans: number }> = [];

  // Pattern: 답지 '①', 답지 "②", etc.
  for (const m of text.matchAll(
    /답지\s*['"`]\s*([①②③④⑤])\s*['"`]/g,
  )) {
    allMatches.push({ idx: m.index!, ans: '①②③④⑤'.indexOf(m[1]) + 1 });
  }

  // Pattern: 정답 ①, 정답: ②
  for (const m of text.matchAll(/정답\s*[:：]?\s*([①②③④⑤])/g)) {
    allMatches.push({ idx: m.index!, ans: '①②③④⑤'.indexOf(m[1]) + 1 });
  }

  // Pattern: standalone circled number before 오답 피하기
  for (const m of text.matchAll(/오답\s*피하기\s*\n\s*답지\s*['"`]\s*([①②③④⑤])\s*['"`]/g)) {
    allMatches.push({ idx: m.index!, ans: '①②③④⑤'.indexOf(m[1]) + 1 });
  }

  // Match question numbers before each answer
  const answers: Answer[] = [];
  for (const m of allMatches) {
    const before = text.substring(Math.max(0, m.idx - 300), m.idx);
    // Find the nearest question number (1-30) before this answer
    const qnMatches = [...before.matchAll(/\b(\d{1,2})\b/g)];
    if (qnMatches.length > 0) {
      const lastQn = qnMatches[qnMatches.length - 1];
      const qn = parseInt(lastQn[1], 10);
      if (qn >= 1 && qn <= 30 && !answers.find((a) => a.qn === qn)) {
        answers.push({ qn, ans: m.ans });
      }
    }
  }

  answers.sort((a, b) => a.qn - b.qn);
  return answers;
}

async function main() {
  const home = process.env.HOME || '/Users/yjshin';

  const subjects: Array<{
    name: string;
    subject: 'sungjik' | 'kongil';
    pdfName: string;
  }> = [
    { name: '성직', subject: 'sungjik', pdfName: '성직_답.pdf' },
    { name: '공일', subject: 'kongil', pdfName: '공일_답.pdf' },
  ];

  const allAnswers: Map<
    string,
    Map<number, Answer[]>
  > = new Map();

  for (const { name, subject } of subjects) {
    const pdfPath = `${home}/Downloads/${name}_답.pdf`;
    const answers = extractAnswers(pdfPath);
    console.log(`${name}: ${answers.length} answers extracted`);
    for (const a of answers) console.log(`  Q${a.qn} = ${a.ans}`);
  }

  // Sync to Supabase
  const url = process.env.DATABASE_SUPABASE_URL;
  if (!url) throw new Error('DATABASE_SUPABASE_URL required');

  const ds = new DataSource({
    type: 'postgres',
    url,
    connectTimeoutMS: 30000,
  });
  await ds.initialize();

  // Build answer map per unit per subject
  for (const { subject } of subjects) {
    const pdfPath = `${home}/Downloads/${subject === 'sungjik' ? '성직' : '공일'}_답.pdf`;
    const answers = extractAnswers(pdfPath);

    // Suteck PDFs have 10 questions per unit. Q1-10 = unit 1, Q11-20 = unit 2, etc.
    // But the 해설 PDF may have all units combined. Let me match by filename + question number.
    // Suteck filenames: 성직_N단원_문제.pdf with questions 1-10.
    // The 해설 PDF has all answers sequentially. Need to map by unit.

    const rows = await ds.query(
      `SELECT id, logical_source_id, source_payload
       FROM reference_questions
       WHERE source_payload->'source'->>'type' = 'suteck'
       AND source_payload->'source'->>'subject' = $1`,
      [subject],
    );

    let updated = 0;
    for (const row of rows) {
      const p = row.source_payload;
      const fn = p.source?.filename as string | undefined;
      const qn = p.questionNumber as number | undefined;
      if (!fn || !qn) continue;

      // Extract unit number from filename: 성직_N단원_문제.pdf → N
      const unitMatch = fn.match(/(\d+)단원/);
      if (!unitMatch) continue;
      const unitNum = parseInt(unitMatch[1], 10);

      // Each unit has 10 questions, so answers for unit N are at indices (N-1)*10 to N*10-1
      const globalQn = (unitNum - 1) * 10 + qn;
      const answer = answers.find((a) => a.qn === globalQn);
      if (!answer) continue;

      const dbAns = p.correctAnswer;
      if (dbAns === answer.ans) continue;

      await ds.query(
        `UPDATE reference_questions
         SET source_payload = jsonb_set(
           source_payload,
           '{correctAnswer}',
           to_jsonb($1::int)
         )
         WHERE id = $2`,
        [answer.ans, row.id],
      );
      updated++;
      console.log(
        `  Updated ${row.logical_source_id}: ${dbAns} -> ${answer.ans}`,
      );
    }
    console.log(`${subject}: ${updated} updated`);
  }

  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
