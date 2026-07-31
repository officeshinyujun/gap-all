/**
 * Extract per-question explanations from 해설 PDFs and store in DB.
 * Then rewrite them to be simpler/more readable.
 */
import { execFileSync } from 'node:child_process';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';

interface Explanation {
  /** Question number within the unit (1-10) */
  qn: number;
  /** Full explanation text: 해설 + 오답 피하기 */
  text: string;
}

function extractExplanations(pdfPath: string): Map<number, Explanation[]> {
  const text = execFileSync('pdftotext', ['-raw', pdfPath, '-']).toString(
    'utf8',
  );

  // Find the answer table block to know where unit sections start
  // Each unit has: "수능실전문제\n1 ⑤ 2 ① ...\n" followed by explanations
  const answerBlocks = [...text.matchAll(/수능실전문제\n(?:\d+\s+[①②③④⑤]\s*)+\n/g)];
  
  const result = new Map<number, Explanation[]>();
  
  for (let unitIdx = 0; unitIdx < answerBlocks.length; unitIdx++) {
    const unitNum = unitIdx + 1;
    const blockStart = answerBlocks[unitIdx].index! + answerBlocks[unitIdx][0].length;
    const blockEnd = unitIdx + 1 < answerBlocks.length 
      ? answerBlocks[unitIdx + 1].index! 
      : text.length;
    const unitText = text.substring(blockStart, blockEnd);

    // Find each question explanation: starts with a number followed by "출제 의도" or "해설"
    const qMatches = [...unitText.matchAll(/\n(\d{1,2})\s+(?:출제\s*의도|해설)/g)];
    const explanations: Explanation[] = [];
    
    for (let qi = 0; qi < qMatches.length; qi++) {
      const qn = parseInt(qMatches[qi][1], 10);
      if (qn < 1 || qn > 10) continue;
      
      const qStart = qMatches[qi].index!;
      const qEnd = qi + 1 < qMatches.length ? qMatches[qi + 1].index! : unitText.length;
      let qText = unitText.substring(qStart, qEnd).trim();
      
      // Clean up the text: remove excessive whitespace, normalize line breaks
      qText = qText.replace(/\s+/g, ' ').trim();
      
      if (qText.length > 50) {
        explanations.push({ qn, text: qText });
      }
    }
    
    if (explanations.length > 0) {
      result.set(unitNum, explanations);
    }
  }
  
  return result;
}

async function simplifyExplanation(text: string): Promise<string> {
  // Extract key parts: 해설 and 오답 피하기
  const haeseolMatch = text.match(/해설\s*(.*?)(?:오답\s*피하기|$)/);
  const odapMatch = text.match(/오답\s*피하기\s*(.*?)$/);
  
  let result = '';
  
  if (haeseolMatch) {
    let haeseol = haeseolMatch[1].trim();
    // Remove "출제 의도" prefix
    haeseol = haeseol.replace(/^\d+\s+출제\s*의도\s*[^해]*해설\s*/, '');
    haeseol = haeseol.replace(/^\d+\s*해설\s*/, '');
    result += '【해설】 ' + haeseol;
  }
  
  if (odapMatch) {
    let odap = odapMatch[1].trim().replace(/\s+/g, ' ');
    result += '\n\n【오답 피하기】 ' + odap;
  }
  
  // If no structure found, return cleaned text
  if (!result) {
    result = text.replace(/^\d+\s+출제\s*의도\s*[^해]*해설\s*/, '【해설】 ');
    result = result.replace(/오답\s*피하기\s*/g, '\n\n【오답 피하기】 ');
  }
  
  return result.trim();
}

async function main() {
  const home = process.env.HOME || '/Users/yjshin';
  const url = process.env.DATABASE_SUPABASE_URL;
  if (!url) throw new Error('DATABASE_SUPABASE_URL required');

  const ds = new DataSource({ type: 'postgres', url, connectTimeoutMS: 30000 });
  await ds.initialize();

  const cleanOnly = process.argv.includes('--clean-only');

  for (const [pdfName, subject] of [['성직_답', 'sungjik'], ['공일_답', 'kongil']] as const) {
    const pdfPath = `${home}/Downloads/${pdfName}.pdf`;
    console.log(`Processing ${pdfName}...`);
    
    const allExplanations = extractExplanations(pdfPath);
    console.log(`  Units with explanations: ${allExplanations.size}`);
    
    const rows = await ds.query(
      `SELECT id, logical_source_id, source_payload
       FROM reference_questions
       WHERE source_payload->'source'->>'type' = 'suteck'
       AND source_payload->'source'->>'subject' = $1`,
      [subject],
    );

    let stored = 0;
    for (const row of rows) {
      const p = row.source_payload;
      const fn = p.source?.filename as string | undefined;
      const qn = p.questionNumber as number | undefined;
      if (!fn || !qn) continue;
      
      const unitMatch = fn.match(/(\d+)단원/);
      if (!unitMatch) continue;
      const unitNum = parseInt(unitMatch[1], 10);
      
      const unitExplanations = allExplanations.get(unitNum);
      if (!unitExplanations) continue;
      
      const exp = unitExplanations.find((e) => e.qn === qn);
      if (!exp) continue;

      let finalText = exp.text;
      if (!cleanOnly) {
        finalText = await simplifyExplanation(exp.text);
      }

      await ds.query(
        `UPDATE reference_questions
         SET source_payload = jsonb_set(
           source_payload,
           '{explanation}',
           to_jsonb($1::text)
         )
         WHERE id = $2`,
        [finalText, row.id],
      );
      stored++;
    }
    console.log(`  Stored explanations: ${stored}`);
  }

  // Count
  const count = await ds.query(
    `SELECT count(*) as c FROM reference_questions
     WHERE source_payload ? 'explanation'
     AND source_payload->>'explanation' IS NOT NULL
     AND source_payload->>'explanation' != ''`
  );
  console.log(`\nTotal with explanations: ${count[0].c}`);

  await ds.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
