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
const MAX_RETRIES = 4;
const TARGET_UNIT = Number(process.env.TARGET_UNIT ?? 0);
const FORCE = process.env.FORCE === '1';
const REPAIR_INVALID = process.env.REPAIR_INVALID === '1';
const TARGET_SUBJECT = process.env.TARGET_SUBJECT ?? 'sungjik';

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

function stimulusToText(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.content === 'string') return value.content;
  if (Array.isArray(value.paragraphs)) return value.paragraphs
    .map((p: any) => typeof p === 'string' ? p : p.content || p.text || '')
    .join('\n');
  if (Array.isArray(value.messages)) return value.messages.map((m: any) => m.text || '').join('\n');
  if (Array.isArray(value.rows)) {
    const headers = Array.isArray(value.headers) ? value.headers.join(' | ') : '';
    return [headers, ...value.rows.map((row: any) => Array.isArray(row) ? row.join(' | ') : '')]
      .filter(Boolean).join('\n');
  }
  return '';
}

function questionType(stem: string, hasComboItems: boolean): 'combo' | 'find_wrong' | 'single' {
  if (hasComboItems) return 'combo';
  if (/옳지 않은|적절하지 않은|적절하지 않는/.test(stem)) return 'find_wrong';
  return 'single';
}

function extractJson(text: string): any {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  try { return JSON.parse(m ? m[1].trim() : text.trim()); }
  catch { return null; }
}

function validateHighlight(highlight: any, question: any): string[] {
  const errors: string[] = [];
  if (!highlight || !Array.isArray(highlight.solvingFlow) || highlight.solvingFlow.length < 3) errors.push('solvingFlow must contain at least 3 steps');
  if (!Array.isArray(highlight?.stimulusClues)) errors.push('stimulusClues must be an array');
  if (typeof highlight?.takeaway !== 'string' || !highlight.takeaway.trim()) errors.push('takeaway is missing');
  if (!Array.isArray(highlight?.optionAnalysis)) errors.push('optionAnalysis must be an array');
  if (errors.length) return errors;

  const qd = question || {};
  const answer = parseAnswer(qd.correct_answer ?? qd.answer);
  const options = qd.options || qd.render_ready?.options_list || [];
  const comboItems = Array.isArray(qd.box_items) ? qd.box_items : [];
  const type = questionType(qd.render_ready?.question_stem || qd.stem || '', comboItems.length > 0);
  const analysis = highlight.optionAnalysis;

  for (const option of analysis) {
    if (option.verdict !== 'O' && option.verdict !== 'X') errors.push('each verdict must be O or X');
    if (typeof option.reasoning !== 'string' || option.reasoning.trim().length < 5) errors.push('each reasoning is too short');
  }

  if (type === 'combo') {
    const expectedKeys = comboItems.map((_, i) => String.fromCharCode('ㄱ'.charCodeAt(0) + i));
    const actualKeys = analysis.map((option: any) => option.optionKey);
    if (analysis.length !== comboItems.length || actualKeys.some((key: any, i: number) => key !== expectedKeys[i])) {
      errors.push(`combo option keys/count must be ${expectedKeys.join(',')}`);
    }
    const expected = String(options[answer - 1] || '').match(/[ㄱ-ㄹ]/g) || [];
    const actual = analysis.filter((option: any) => option.verdict === 'O').map((option: any) => option.optionKey);
    if (!expected.length || expected.length !== actual.length || expected.some((key: string) => !actual.includes(key))) {
      errors.push('combo O/X pattern does not match the correct option');
    }
  } else {
    const numbers = analysis.map((option: any) => option.optionNum);
    if (analysis.length !== 5 || numbers.some((n: any, i: number) => n !== i + 1)) errors.push('normal optionAnalysis must contain optionNum 1 through 5 in order');
    const expectedVerdict = type === 'find_wrong' ? 'X' : 'O';
    const correct = analysis.find((option: any) => option.optionNum === answer);
    if (correct?.verdict !== expectedVerdict) errors.push(`correct answer must be ${expectedVerdict}`);
    const expectedO = type === 'find_wrong' ? 4 : 1;
    if (analysis.filter((option: any) => option.verdict === 'O').length !== expectedO) errors.push(`${type} requires ${expectedO} O verdict(s)`);
  }

  const rawStimulus = stimulusToText(qd.stimulus || qd.render_ready?.stimulus_data);
  if (rawStimulus && (!highlight.stimulusClues.length || highlight.stimulusClues.some((clue: any) =>
    typeof clue.quote !== 'string' || !rawStimulus.includes(clue.quote)))) {
    errors.push('every stimulus clue quote must be present verbatim in the stimulus');
  }
  return [...new Set(errors)];
}

async function generateHighlight(
  conceptName: string,
  definition: string,
  qd: any,
): Promise<ConceptHighlightV2 | null> {
  const client = nextClient();
  const stem = qd?.render_ready?.question_stem || qd?.stem || '';
  const stimulus = stimulusToText(qd?.stimulus || qd?.render_ready?.stimulus_data);
  const answer = parseAnswer(qd?.correct_answer ?? qd?.answer);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
      temperature: attempt === 1 ? 0.2 : 0.4,
      response_format: { type: 'json_object' },
    });

    const content = resp.choices[0]?.message?.content ?? '';
    const highlight = extractJson(content) as ConceptHighlightV2;
    const errors = validateHighlight(highlight, qd);
    if (!errors.length) return highlight;
    console.warn(`  ⚠️ [${conceptName}] 시도 ${attempt}/${MAX_RETRIES} 검증 실패: ${errors.join('; ')}`);
   } catch (e) {
    console.error(`  ✗ [${conceptName}] API 오류: ${(e as Error).message}`);
   }
  }
  return null;
}

async function main() {
  // 누락된 24개 카드 조회
  const { data: units } = await supabase
    .from('textbook_units')
    .select('id, unit_number')
    .eq('subject', TARGET_SUBJECT);

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
    (FORCE || !c.real_question.conceptHighlightV2 || (REPAIR_INVALID && validateHighlight(c.real_question.conceptHighlightV2, c.real_question.questionData).length > 0)) &&
    (!TARGET_UNIT || unitMap.get(c.unit_id) === TARGET_UNIT)
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
        const errors = validateHighlight(h, qd);
        if (errors.length) {
          console.warn(`    ✗ [${card.name}] 검증 실패 — 저장하지 않음: ${errors.join('; ')}`);
          return false;
        }

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

        console.log(`  ✓ [${card.name}] 저장 완료`);
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
