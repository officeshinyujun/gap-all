/**
 * Generate structured concept-definition content without changing questions.
 *
 * Examples:
 *   npx tsx scripts/generate-concept-definitions.ts --subject success --from-unit 2
 *   npx tsx scripts/generate-concept-definitions.ts --subject success --from-unit 2 --dry-run
 *   npx tsx scripts/generate-concept-definitions.ts --subject success --from-unit 2 --force
 */
import OpenAI from 'openai';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

type ConceptDefinition = {
  summary: string;
  sections: { title: string; description: string; examples: string[] }[];
  comparison?: { headers: string[]; rows: string[][] };
  commonConfusions: string[];
};

type Args = {
  subject: string;
  fromUnit: number;
  toUnit?: number;
  force: boolean;
  dryRun: boolean;
  limit: number;
};

const args: Args = {
  subject: 'success',
  fromUnit: 2,
  force: false,
  dryRun: false,
  limit: 0,
};

for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg === '--subject') args.subject = process.argv[++i] ?? args.subject;
  else if (arg === '--from-unit') args.fromUnit = Number(process.argv[++i]);
  else if (arg === '--to-unit') args.toUnit = Number(process.argv[++i]);
  else if (arg === '--force') args.force = true;
  else if (arg === '--dry-run') args.dryRun = true;
  else if (arg === '--limit') args.limit = Number(process.argv[++i]);
}

const API_KEYS = [
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_API_KEY2,
  process.env.OPENAI_API_KEY3,
].filter((key): key is string => Boolean(key));
if (API_KEYS.length === 0) throw new Error('OPENAI_API_KEY가 필요합니다.');
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL과 SUPABASE_SERVICE_KEY가 필요합니다.');
}

const clients = API_KEYS.map((key) => new OpenAI({ apiKey: key }));
let clientIndex = 0;
const nextClient = () => clients[clientIndex++ % clients.length];
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const dbSubject = args.subject === 'success' ? 'sungjik' : args.subject === 'industry' ? 'kongil' : args.subject;
const MODEL = process.env.OPENAI_CONCEPT_DEFINITION_MODEL ?? 'gpt-4o-mini';
const CONCURRENCY = 2;
const MAX_RETRIES = 3;

const SYSTEM_PROMPT = `당신은 한국 수능 직업탐구 과목의 개념 교재를 편집하는 전문가다.
목표는 한 개념을 학습 탭에서 읽기 좋은 구조화된 개념 정의로 만드는 것이다.

반드시 JSON 객체 하나만 출력한다. Markdown 코드블록, 설명 문장, 추가 키를 출력하지 않는다.

출력 스키마:
{
  "summary": "개념의 핵심 정의 1~2문장",
  "sections": [
    { "title": "구성 요소 또는 유형명", "description": "정확한 의미와 구분 기준", "examples": ["짧은 예시 또는 대표 키워드"] }
  ],
  "comparison": {
    "headers": ["구분", "..."],
    "rows": [["...", "..."]]
  },
  "commonConfusions": ["이 개념에서 자주 혼동하는 구분과 올바른 기준"]
}

작성 규칙:
1. summary는 80~220자, sections는 2~6개, 각 examples는 1~5개, commonConfusions는 1~3개로 작성한다.
2. 개념 정의와 문제 풀이를 분리한다. 정답 번호, 선택지 번호, 특정 인물의 판단, 문제의 정답 해설을 summary/sections에 넣지 않는다.
3. 교과서 원문에 없는 학술 용어·수치·사례를 임의로 만들지 않는다. 입력 자료가 부족하면 일반적인 설명을 억지로 확장하지 말고 핵심 범위만 작성한다.
4. sections는 단순한 핵심 포인트 목록이 아니라, 각 구성 요소의 의미·판별 기준·짧은 예시를 포함해야 한다.
5. comparison은 구성 요소 간 비교가 실제로 의미 있을 때만 출력한다. 의미가 없으면 키를 생략한다.
6. 시험에 나온 문제는 개념의 적용 맥락을 확인하는 참고 자료로만 사용한다. 문제 원문을 다시 쓰거나 문제 해설을 생성하지 않는다.
7. 한국어로 자연스럽게 작성하고, 같은 문장을 반복하지 않는다.`;

function parseJson(content: string): any {
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(match ? match[1] : content);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validate(value: any): ConceptDefinition {
  if (!value || typeof value !== 'object') throw new Error('객체가 아님');
  const summary = text(value.summary);
  const sections = Array.isArray(value.sections) ? value.sections.map((section: any) => ({
    title: text(section?.title),
    description: text(section?.description),
    examples: Array.isArray(section?.examples) ? section.examples.map(text).filter(Boolean) : [],
  })).filter((section: any) => section.title && section.description) : [];
  const commonConfusions = Array.isArray(value.commonConfusions)
    ? value.commonConfusions.map(text).filter(Boolean)
    : [];

  if (summary.length < 50) throw new Error('summary가 너무 짧음');
  if (sections.length < 2) throw new Error('sections가 2개 미만');
  if (sections.some((section: any) => section.examples.length === 0)) throw new Error('examples가 없음');
  if (commonConfusions.length === 0) throw new Error('commonConfusions가 없음');

  let comparison: ConceptDefinition['comparison'];
  if (value.comparison) {
    const headers = Array.isArray(value.comparison.headers) ? value.comparison.headers.map(text).filter(Boolean) : [];
    const rows = Array.isArray(value.comparison.rows)
      ? value.comparison.rows.filter(Array.isArray).map((row: any[]) => row.map(text))
      : [];
    if (headers.length >= 2 && rows.length >= 2 && rows.every((row) => row.length === headers.length && row.every(Boolean))) {
      comparison = { headers, rows };
    }
  }

  return { summary, sections, ...(comparison ? { comparison } : {}), commonConfusions };
}

function questionText(realQuestion: any): string {
  const qd = realQuestion?.questionData;
  if (!qd) return '';
  const stimulus = qd.stimulus || qd.render_ready?.stimulus_data;
  if (typeof stimulus === 'string') return stimulus;
  if (stimulus?.content) return stimulus.content;
  if (stimulus?.messages) return stimulus.messages.map((item: any) => item.text || '').join('\n');
  return '';
}

async function generate(card: any): Promise<ConceptDefinition> {
  const qd = card.real_question?.questionData;
  const payload = {
    concept_name: card.name,
    base_definition: card.definition || card.enriched_definition || '',
    textbook_excerpt: card.textbook_excerpt || '',
    representative_question_context: {
      stem: qd?.stem || qd?.render_ready?.question_stem || '',
      stimulus: questionText(card.real_question),
    },
  };

  let lastError = '생성 실패';
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await nextClient().chat.completions.create({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      });
      return validate(parseJson(response.choices[0]?.message?.content ?? ''));
    } catch (error: any) {
      lastError = error?.message || String(error);
      if (attempt < MAX_RETRIES) await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    }
  }
  throw new Error(lastError);
}

async function main() {
  const { data: units, error: unitError } = await supabase
    .from('textbook_units')
    .select('id, unit_number')
    .eq('subject', dbSubject)
    .gte('unit_number', args.fromUnit)
    .order('unit_number');
  if (unitError || !units) throw new Error(`단원 조회 실패: ${unitError?.message}`);

  const filteredUnits = units.filter((unit) => args.toUnit == null || unit.unit_number <= args.toUnit!);
  const { data: cards, error: cardError } = await supabase
    .from('textbook_concept_cards')
    .select('id, name, unit_id, definition, enriched_definition, textbook_excerpt, real_question')
    .in('unit_id', filteredUnits.map((unit) => unit.id))
    .order('unit_id')
    .order('rank');
  if (cardError || !cards) throw new Error(`카드 조회 실패: ${cardError?.message}`);

  const targets = cards.filter((card) => card.real_question?.questionData && (args.force || !card.real_question?.conceptDefinition));
  const limited = args.limit > 0 ? targets.slice(0, args.limit) : targets;
  console.log(`대상: ${limited.length}개 / 전체 ${cards.length}개 (과목 ${args.subject}, ${args.fromUnit}단원~)`);
  if (args.dryRun) return;

  let success = 0;
  let failed = 0;
  for (let i = 0; i < limited.length; i += CONCURRENCY) {
    const batch = limited.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (card) => {
      try {
        const conceptDefinition = await generate(card);
        const { error } = await supabase
          .from('textbook_concept_cards')
          .update({ real_question: { ...card.real_question, conceptDefinition } })
          .eq('id', card.id);
        if (error) throw new Error(error.message);
        success += 1;
        console.log(`✓ ${card.name}`);
      } catch (error: any) {
        failed += 1;
        console.error(`✗ ${card.name}: ${error.message}`);
      }
    }));
  }
  console.log(`완료: ${success}개 성공, ${failed}개 실패`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exit(1); });
