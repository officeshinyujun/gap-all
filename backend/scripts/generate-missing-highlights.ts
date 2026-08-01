/**
 * 누락된 24개 개념의 conceptHighlightV2를 생성하고 Supabase에 직접 저장
 * 
 * 실행: npx ts-node --compiler-options '{"module":"commonjs"}' scripts/generate-missing-highlights.ts
 */
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const API_KEYS = [
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_API_KEY2,
  process.env.OPENAI_API_KEY3,
].filter((k): k is string => typeof k === 'string' && k.length > 0);

const clients = API_KEYS.map((key) => new OpenAI({ apiKey: key }));
let ci = 0;
const nextClient = () => clients[ci++ % clients.length];

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const PROMPT_PATH = path.resolve(__dirname, '..', '..', 'prompts', 'concept_highlight_v2.txt');
const systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
const MODEL = 'gpt-4o';
const CONCURRENCY = 2;

interface ConceptHighlightV2 {
  stimulusClues: { quote: string; why: string }[];
  optionAnalysis: ({ optionNum: number; verdict: string; reasoning: string } | { optionKey: string; verdict: string; reasoning: string })[];
  solvingFlow: { step: number; action: string }[];
  takeaway: string;
}

function parseAnswer(value: unknown): number {
  if (typeof value === 'number') return value === 0 ? 1 : value;
  if (typeof value === 'string') {
    const map: Record<string, number> = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
    if (map[value]) return map[value];
    const n = parseInt(value.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n) && n >= 1 && n <= 5) return n;
  }
  return 1;
}

function extractJson(text: string): any {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  try { return JSON.parse(m ? m[1].trim() : text.trim()); }
  catch { return null; }
}

async function generateHighlight(
  conceptName: string,
  definition: string,
  qd: any,
): Promise<ConceptHighlightV2 | null> {
  const client = nextClient();
  const stem = qd?.render_ready?.question_stem || qd?.stem || '';
  const stimulus = qd?.render_ready?.stimulus_data
    ? JSON.stringify(qd.render_ready.stimulus_data)
    : qd?.stimulus || '';
  const answer = parseAnswer(qd?.correct_answer ?? qd?.answer);

  try {
    const resp = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({
          concept_name: conceptName,
          concept_definition: definition || '',
          question_stem: stem,
          stimulus,
          options: qd?.render_ready?.options_list || qd?.options || [],
          correct_answer: answer,
          combo_items: qd?.box_items || [],
        })},
      ],
      temperature: 0.3,
    });

    const content = resp.choices[0]?.message?.content ?? '';
    return extractJson(content) as ConceptHighlightV2;
  } catch (e) {
    console.error(`  ✗ [${conceptName}] API 오류: ${(e as Error).message}`);
    return null;
  }
}

async function main() {
  // 누락된 24개 카드 조회
  const { data: units } = await supabase
    .from('textbook_units')
    .select('id, unit_number')
    .eq('subject', 'sungjik');

  if (!units) { console.error('No units found'); return; }

  const unitMap = new Map(units.map(u => [u.id, u.unit_number]));

  const { data: cards } = await supabase
    .from('textbook_concept_cards')
    .select('id, name, unit_id, definition, enriched_definition, real_question')
    .in('unit_id', units.map(u => u.id));

  if (!cards) { console.error('No cards found'); return; }

  const missing = cards.filter(c =>
    c.real_question &&
    c.real_question.questionData &&
    !c.real_question.conceptHighlightV2
  );

  console.log(`🎯 처리 대상: ${missing.length}개\n`);

  let done = 0;
  let failed = 0;

  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);

    const results = await Promise.all(batch.map(async (card) => {
      const unitNum = unitMap.get(card.unit_id) || 0;
      const qd = card.real_question.questionData;
      const definition = card.enriched_definition || card.definition || '';

      console.log(`  🔄 [${card.name}] 생성 중...`);

      const h = await generateHighlight(card.name, definition, qd);

      if (h) {
        // O/X 검증
        const answer = parseAnswer(qd?.correct_answer ?? qd?.answer);
        const oCount = h.optionAnalysis.filter(o => o.verdict === 'O').length;
        const correctVerdict = h.optionAnalysis.find((o: any) => o.optionNum === answer)?.verdict;

        let status = '✓';
        if (oCount !== 1) { status = '⚠️'; console.warn(`    O=${oCount}개 (1개만 O여야 함)`); }
        else if (correctVerdict !== 'O') { status = '⚠️'; console.warn(`    정답(${answer}번)=${correctVerdict}`); }

        // Supabase 업데이트
        const updatedRQ = {
          ...card.real_question,
          conceptHighlightV2: h,
        };

        const { error } = await supabase
          .from('textbook_concept_cards')
          .update({ real_question: updatedRQ })
          .eq('id', card.id);

        if (error) {
          console.error(`    ✗ Supabase 저장 실패: ${error.message}`);
          return false;
        }

        console.log(`  ${status} [${card.name}] (O=${oCount}, 답${answer}번=${correctVerdict})`);
        return true;
      } else {
        console.error(`  ✗ [${card.name}] 생성 실패`);
        return false;
      }
    }));

    done += results.filter(Boolean).length;
    failed += results.filter(r => !r).length;

    if (i + CONCURRENCY < missing.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`\n========================================`);
  console.log(`📊 완료: ${done}/${missing.length} 성공, ${failed} 실패`);
}

main().catch(console.error);
