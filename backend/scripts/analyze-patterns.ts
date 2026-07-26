import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ANALYZE_PROMPT = `You are a Korean CSAT vocational exam (직업탐구) question analyst.

For EACH question below, output ONE entry analyzing its stem intent and structure. Do NOT group or merge similar questions — each question gets its own entry.

Focus on:
1. **STEM INTENT**: Why is the stem written this way? What does it want the test-taker to do?
   - Example: "2027년 3월 5일부터 2027년 4월 22일까지" → intent is to calculate working days/holidays within a date range for wage computation
   - Example: "다음 사례에 나타난" → intent is to match a real-world scenario to a legal/conceptual framework
2. **KEY INDICATORS**: Distinctive words, date patterns, conditionals in the stem
3. **JUDGMENT AXES**: What is the test-taker judging? (calculation, concept matching, procedure, document interpretation)
4. **STEM PATTERN TEMPLATE**: The structural template of the stem sentence

Return JSON with an "entries" array, one per question, in the SAME ORDER as received:
{
  "questionIndex": 0,
  "patternId": "UPPER_SNAKE_CASE_ID",
  "name": "Korean name describing this question type",
  "intent": "detailed intent explanation in Korean",
  "stemPattern": "the stem structure template in Korean",
  "indicators": ["keyword1", "keyword2"],
  "judgmentAxes": ["axis1", "axis2"],
  "itemFamilies": ["combination_judgment", "single_selection"],
  "templates": ["TPL_CASE_DIAGNOSTIC_FRAME"],
  "variationTips": ["변형 팁1", "변형 팁2"]
}`;

async function analyzeBatch(questions: any[]): Promise<any[]> {
  const qtext = questions
    .map((q) => {
      let txt = `[Q${q.questionNumber}] stem: ${(q.stem || '').slice(0, 300)}\n`;
      if (q.stimulus) txt += `  stimulus: ${q.stimulus.slice(0, 200)}\n`;
      if (q.viewItems?.length)
        txt += `  viewItems: ${q.viewItems.join(' | ').slice(0, 300)}\n`;
      if (q.targetConcepts?.length)
        txt += `  concepts: ${q.targetConcepts.join(', ')}\n`;
      return txt;
    })
    .join('\n');

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_STEP1_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: ANALYZE_PROMPT },
      {
        role: 'user',
        content: `Analyze these questions and extract patterns:\n\n${qtext}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];
  const parsed = JSON.parse(content);
  return parsed.entries || parsed.patterns || [];
}

async function analyzeUnit(subject: string, unit: number) {
  const textbookBase = path.resolve(__dirname, '..', '..', '..', 'textbook');
  const allDir = path.join(textbookBase, 'parsed', subject, 'all');
  const outDir = path.join(textbookBase, 'question-patterns', subject);
  const fp = path.join(allDir, `${unit}단원.json`);
  if (!fs.existsSync(fp)) return;

  const questions = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  if (questions.length === 0) return;

  const mid = Math.ceil(questions.length / 2);
  const batch1 = questions.slice(0, mid);
  const batch2 = questions.slice(mid);

  process.stdout.write(`${subject} ${unit}단원 (${questions.length}문항)... `);

  try {
    const [p1, p2] = await Promise.all([
      analyzeBatch(batch1),
      analyzeBatch(batch2),
    ]);

    const entries = [...p1, ...p2];

    const result = {
      unitNumber: unit,
      subject,
      totalQuestions: questions.length,
      entries,
    };

    fs.writeFileSync(
      outDir + '/' + unit + '단원.json',
      JSON.stringify(result, null, 2),
    );
    process.stdout.write(entries.length + '개 엔트리 ✓\n');
  } catch (e: any) {
    process.stdout.write('실패: ' + e.message.slice(0, 60) + '\n');
  }
}

async function main() {
  const subjects = ['sungjik', 'kongil'];

  for (const subject of subjects) {
    console.log(`\n===== ${subject} =====`);
    for (let unit = 1; unit <= 20; unit++) {
      await analyzeUnit(subject, unit);
    }
  }

  console.log('\n✅ ALL DONE');
}

main().catch(console.error);
