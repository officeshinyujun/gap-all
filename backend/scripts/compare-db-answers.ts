/**
 * Compare DB answers against official answer keys.
 * Lists any mismatches.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { parseOfficialAnswerKeyText } from '../src/exams/question-parser.service';

const ROOT = path.resolve(__dirname, '../..');
const QUESTION_ROOT = path.join(ROOT, 'question', 'moi');
const SUBJECTS = ['sungjik', 'kongil'] as const;

function loadAnswerKeys(): Map<string, Map<number, number>> {
  const keys = new Map<string, Map<number, number>>();
  for (const subject of SUBJECTS) {
    const subjectDir = path.join(QUESTION_ROOT, subject);
    if (!fs.existsSync(subjectDir)) continue;
    for (const year of fs.readdirSync(subjectDir).sort()) {
      const yearDir = path.join(subjectDir, year);
      if (!fs.statSync(yearDir).isDirectory()) continue;
      for (const examType of fs.readdirSync(yearDir).sort()) {
        const examDir = path.join(yearDir, examType);
        if (!fs.statSync(examDir).isDirectory()) continue;
        const files = fs.readdirSync(examDir).filter((f) =>
          f.includes('정답'),
        );
        for (const file of files) {
          const filePath = path.join(examDir, file);
          try {
            const text = execFileSync('pdftotext', [
              '-layout',
              '-nopgbrk',
              filePath,
              '-',
            ]).toString('utf8');
            if (!text.trim()) continue;
            const parsed = parseOfficialAnswerKeyText(text);
            if (parsed.size === 0) continue;
            // Normalize examType (NFC for macOS compatibility)
            const normalizedExamType = examType.normalize('NFC');
            const key = `${subject}:${year}:${normalizedExamType}`;
            const existing = keys.get(key);
            if (existing) {
              for (const [qn, ans] of parsed) existing.set(qn, ans);
            } else {
              keys.set(key, parsed);
            }
          } catch {
            // pdftotext failed (image-only PDF)
          }
        }
      }
    }
  }
  return keys;
}

async function main() {
  const answerKeys = loadAnswerKeys();
  console.log(`Answer keys loaded: ${answerKeys.size} exams`);

  const url = process.env.DATABASE_SUPABASE_URL;
  if (!url) throw new Error('DATABASE_SUPABASE_URL required');

  const ds = new DataSource({ type: 'postgres', url, connectTimeoutMS: 30000 });
  await ds.initialize();

  const rows = await ds.query(
    `SELECT logical_source_id, source_payload FROM reference_questions`,
  );

  let checked = 0;
  let matched = 0;
  let mismatched = 0;
  let noAnswer = 0;
  const issues: string[] = [];

  for (const r of rows) {
    const src = r.source_payload?.source;
    if (src?.type !== 'moi') continue;
    const dbAnswer = r.source_payload?.correctAnswer;
    const fn = src?.filename as string | undefined;
    const qn = src?.questionNumber as number | undefined;
    if (!fn || !qn) continue;

    // Find matching answer key
    const [subject, yearStr, rest] = fn.split('_');
    const year = parseInt(yearStr, 10);
    let examTypeStr = '';
    if (rest?.includes('수능')) examTypeStr = '수능';
    else if (rest?.includes('6월')) examTypeStr = '6월_모의평가';
    else if (rest?.includes('9월')) examTypeStr = '9월_모의평가';
    else continue;

    examTypeStr = examTypeStr.normalize('NFC');
    const key = `${src.subject}:${year}:${examTypeStr}`;
    const answerMap = answerKeys.get(key);
    if (!answerMap) continue;

    const officialAnswer = answerMap.get(qn);
    if (officialAnswer === undefined) continue;

    checked++;

    if (dbAnswer === officialAnswer) {
      matched++;
    } else if (dbAnswer === null || dbAnswer === undefined) {
      noAnswer++;
      if (issues.length < 20) {
        issues.push(
          `NO_ANSWER: ${r.logical_source_id} (official: ${officialAnswer})`,
        );
      }
    } else {
      mismatched++;
      issues.push(
        `MISMATCH: ${r.logical_source_id} DB=${dbAnswer} official=${officialAnswer}`,
      );
    }
  }

  console.log(`Checked: ${checked}`);
  console.log(`Matched: ${matched}`);
  console.log(`Mismatched: ${mismatched}`);
  console.log(`No answer in DB: ${noAnswer}`);
  console.log('');
  console.log('Issues:');
  for (const i of issues) console.log('  ' + i);

  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
