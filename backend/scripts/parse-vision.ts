import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const VISION_PROMPT = `Extract all Korean CSAT exam questions from the PDF page images below.
For each question, extract:
- questionNumber: the question number
- stem: the full question stem text
- stimulus: ALL text content including tables, charts, dialogues — preserve EVERYTHING exactly as shown
- viewItems: list of ①②③④⑤ or ㄱㄴㄷㄹ items (array of strings)
- choices: the 5 answer choices with ①~⑤ prefix
- hasStimulus: true if there is any case/stimulus/table/dialogue text
- targetConcepts: the main concepts being tested

CRITICAL: Preserve ALL table structures, charts, and visual content as descriptive text.
If there is a table, describe it in a structured way that preserves the data.
Return a JSON object with a "questions" array containing ALL questions found across all pages.

Return json with: {"questions": [...]}`;

async function parsePdf(
  pdfPath: string,
  subjectEn: string,
  subjectKor: string,
  unitNum: number,
) {
  const tmpDir = `/tmp/pdf_v_${subjectEn}_${unitNum}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  // Convert all pages to images
  execSync(`pdftoppm -png -r 200 "${pdfPath}" "${tmpDir}/page"`, {
    timeout: 60000,
  });

  const pageFiles = fs
    .readdirSync(tmpDir)
    .filter((f) => f.endsWith('.png'))
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, '')) || 0;
      const nb = parseInt(b.replace(/\D/g, '')) || 0;
      return na - nb;
    });

  if (pageFiles.length === 0) {
    console.log('  no pages');
    return [];
  }

  // Build vision content
  const msgContent: any[] = [{ type: 'text', text: VISION_PROMPT }];
  for (const pf of pageFiles) {
    const b64 = fs.readFileSync(path.join(tmpDir, pf)).toString('base64');
    msgContent.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${b64}`, detail: 'low' },
    });
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: msgContent }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const result = response.choices[0]?.message?.content;
  if (!result) return [];

  try {
    const parsed = JSON.parse(result);
    const items = parsed.questions || (Array.isArray(parsed) ? parsed : []);
    return items
      .filter((q: any) => q.questionNumber)
      .map((q: any) => ({
        source: {
          type: 'suteck' as const,
          subject: subjectEn,
          subjectKor,
          unitNumber: unitNum,
          filename: path.basename(pdfPath),
        },
        questionNumber: q.questionNumber,
        stem: String(q.stem || '').replace(/\\n/g, '\n'),
        stimulus: String(q.stimulus || '').replace(/\\n/g, '\n'),
        viewItems: (Array.isArray(q.viewItems) ? q.viewItems : []).map(
          (v: any) => String(v).trim(),
        ),
        choices: (Array.isArray(q.choices) ? q.choices : []).map((c: any) =>
          String(c).trim(),
        ),
        correctAnswer: null,
        difficulty: 'MIDDLE',
        targetConcepts: Array.isArray(q.targetConcepts) ? q.targetConcepts : [],
        hasStimulus: q.hasStimulus ?? (q.stimulus && q.stimulus.length > 10),
      }));
  } catch (e: any) {
    console.log('  parse error:', e.message.slice(0, 60));
    return [];
  }
}

async function main() {
  const baseDir = '/Users/yjshin/projects/gap/question/suteck';
  const outBase = '/Users/yjshin/projects/gap/textbook/parsed';

  const subjects = [
    { prefix: '성직', en: 'sungjik', kor: '성공적인 직업생활' },
    { prefix: '공일', en: 'kongil', kor: '공업 일반' },
  ];

  for (const subj of subjects) {
    console.log(`\n===== ${subj.en} =====`);
    for (let unit = 1; unit <= 20; unit++) {
      const pdfPath = path.join(baseDir, `${subj.prefix}_${unit}단원_문제.pdf`);
      if (!fs.existsSync(pdfPath)) {
        console.log(`  ${unit}: no pdf`);
        continue;
      }

      process.stdout.write(`  ${unit}단원... `);
      try {
        const questions = await parsePdf(pdfPath, subj.en, subj.kor, unit);
        if (questions.length > 0) {
          const outDir = path.join(outBase, subj.en, 'suteck');
          fs.mkdirSync(outDir, { recursive: true });
          fs.writeFileSync(
            path.join(outDir, `${unit}단원.json`),
            JSON.stringify(questions, null, 2),
          );
          console.log(`${questions.length}q ✓`);
        } else {
          console.log('0q ✗');
        }
      } catch (e: any) {
        console.log(`error: ${e.message.slice(0, 50)}`);
      }
    }
  }

  console.log('\n✅ ALL DONE');
}

main().catch(console.error);
