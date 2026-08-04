/**
 * enrich-concept-cards.ts
 *
 * OpenAI API를 사용하여 textbook_concept_cards의 개념 데이터를 보강합니다.
 * 각 개념에 대해:
 *   - 자세한 Markdown 설명 (enriched_definition)
 *   - 핵심 포인트 (key_points)
 *   - 실제 출제 패턴 (concept_usage)
 *   - 오답 주의사항 (caution)
 * 를 생성하여 Supabase에 저장합니다.
 *
 * 사용법:
 *   npx ts-node --project tsconfig.json scripts/enrich-concept-cards.ts
 *     --subject success          # 과목 필터
 *     --unit 1                   # 단원 필터 (선택)
 *     --dry-run                  # 생성 없이 대상만 출력
 *     --force                    # 기존 데이터 덮어쓰기
 *     --limit 10                 # 최대 처리 개수
 */

import OpenAI from 'openai';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ── 설정 ──────────────────────────────────────────────────────────────────────
const API_KEYS = [
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_API_KEY2,
  process.env.OPENAI_API_KEY3,
].filter((k): k is string => typeof k === 'string' && k.length > 0);

if (API_KEYS.length === 0) {
  console.error('❌ 환경변수 OPENAI_API_KEY가 필요합니다.');
  process.exit(1);
}

const clients = API_KEYS.map((key) => new OpenAI({ apiKey: key }));
let clientIndex = 0;
function getNextClient(): OpenAI {
  const c = clients[clientIndex % clients.length];
  clientIndex++;
  return c;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

if (!supabase) {
  console.error('❌ SUPABASE_URL과 SUPABASE_SERVICE_KEY가 필요합니다.');
  process.exit(1);
}

const MODEL = process.env.OPENAI_ENRICH_MODEL ?? 'gpt-4o-mini';
const CONCURRENCY = 2;
const MAX_RETRIES = 3;

const SUBJECT_MAP: Record<string, string> = {
  success: 'sungjik',
  industry: 'kongil',
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface EnrichResult {
  enriched_definition: string;  // 자세한 Markdown 설명
  key_points: string[];         // 핵심 포인트 (Markdown lines)
  concept_usage: string;        // 실제 출제 포인트 (Markdown)
  caution: string;              // 오답 주의사항
}

interface Task {
  cardId: string;
  name: string;
  unitNumber: number;
  subjectSlug: string;
  definition: string;
  textbookExcerpt: string;
  realQuestionStem: string;
  realQuestionStimulus: string | null;
  realQuestionOptions: string[];
  correctAnswer: number;
}

// ── CLI ───────────────────────────────────────────────────────────────────────
function parseArgs() {
  const args: {
    subject?: string;
    unit?: number;
    dryRun: boolean;
    force: boolean;
    limit: number;
  } = {
    dryRun: false,
    force: false,
    limit: 0,
  };

  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--subject' && process.argv[i + 1]) {
      args.subject = process.argv[++i];
    } else if (arg === '--unit' && process.argv[i + 1]) {
      args.unit = parseInt(process.argv[++i], 10);
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--limit' && process.argv[i + 1]) {
      args.limit = parseInt(process.argv[++i], 10);
    }
  }

  return args;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function stimulusDataToPlainText(sd: any): string {
  if (!sd) return '';
  if (typeof sd === 'string') return sd;
  if (sd.content && typeof sd.content === 'string') return sd.content;
  if (sd.messages) return sd.messages.map((m: any) => m.text || '').join('\n');
  if (sd.paragraphs) return sd.paragraphs.map((p: any) => (typeof p === 'string' ? p : p.text || '')).join('\n');
  if (sd.instructor?.dialogue) {
    const items = (sd.canvas_content?.items || []).map((it: any) => it.text || '').join('\n');
    return sd.instructor.dialogue + '\n' + items;
  }
  return '';
}

function parseCorrectAnswer(value: unknown): number {
  if (typeof value === 'number') return value === 0 ? 1 : value;
  if (typeof value === 'string') {
    const map: Record<string, number> = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
    if (map[value]) return map[value];
    const num = parseInt(value.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num >= 1 && num <= 5) return num;
  }
  return 1;
}

function extractJson(text: string): any {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = codeBlock ? codeBlock[1].trim() : text.trim();
  return JSON.parse(raw);
}

function buildConceptPrompt() {
  return `# Role: 수능 직업탐구 개념 해설 전문가
# Context: 주어진 개념과 실제 기출문제를 바탕으로, 수험생이 이 개념을 완전히 이해하고 실제 문제에 적용할 수 있도록 상세한 설명을 작성하라.

# [Input]
- concept_name: 개념명
- definition: 개념의 기본 정의
- textbook_excerpt: 교과서 원문 (있는 경우)
- question_stem: 기출문제 발문
- stimulus: 지문/자료
- options: 선지 목록
- correct_answer: 정답 번호

# [Output JSON Schema]
출력은 반드시 아래 구조의 단일 JSON 객체여야 한다. 부연 설명 없이 JSON만 출력하라.
{
  "enriched_definition": "자세한 개념 설명 (Markdown). ## 개요, ## 핵심 내용, ## 실제 적용 순서로. 수험생이 시험장에서 이 개념을 떠올려야 하는 맥락을 포함할 것. 길이: 300~800자",
  "key_points": [
    "- **핵심 포인트1**: 설명 (Markdown)",
    "- **핵심 포인트2**: 설명"
  ],
  "concept_usage": "이 개념이 실제 시험에서 어떻게 출제되는지 설명 (1~2문장). 예: '조건 A가 제시되면 개념 B를 판단하는 유형으로, 선택지에서 C와 D를 구분하는 함정과 함께 출제된다.'",
  "caution": "이 개념에서 수험생들이 가장 흔히 하는 실수 1가지. '~라고 오해하기 쉽지만, 실제로는 ~이다' 형식으로 1~2문장"
}

# [작성 규칙]
1. **enriched_definition**:
   - Markdown 형식 (## 헤더, **강조**, - 목록 사용)
   - 개념을 추상적으로 설명하지 말고, 주어진 기출문제의 구체적 맥락에서 설명
   - "이 문제에서 ~ 개념이 적용된 이유"를 반드시 포함
   - 교과서 원문이 있으면 그 표현을 인용하여 신뢰감 있게 작성

2. **key_points** (3~5개):
   - 각 항목은 Markdown 형식 (- **키워드**: 설명)
   - 암기할 개념이 아니라 "문제 풀 때 이렇게 생각하라"는 실전 팁으로 작성
   - 주어진 기출문제에서 어떤 단서가 이 key_point로 연결되는지 암시

3. **concept_usage**: 구체적인 문제 유형과 함정 패턴을 언급

4. **caution**: 수험생들이 가장 많이 틀리는 함정 1개. 추상적이지 않고 구체적으로.`;
}

function validateResult(result: EnrichResult): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (!result.enriched_definition || result.enriched_definition.length < 50) {
    warnings.push('enriched_definition이 너무 짧습니다 (50자 미만)');
  }

  if (!result.key_points || result.key_points.length < 2) {
    warnings.push('key_points가 2개 미만입니다');
  }

  if (!result.concept_usage || result.concept_usage.length < 20) {
    warnings.push('concept_usage가 너무 짧습니다 (20자 미만)');
  }

  if (!result.caution || result.caution.length < 10) {
    warnings.push('caution이 너무 짧습니다 (10자 미만)');
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

// ── OpenAI 호출 ───────────────────────────────────────────────────────────────
async function enrichConcept(task: Task): Promise<EnrichResult | null> {
  const systemPrompt = buildConceptPrompt();

  const userContent = JSON.stringify({
    concept_name: task.name,
    definition: task.definition,
    textbook_excerpt: task.textbookExcerpt || '(교과서 원문 없음)',
    question_stem: task.realQuestionStem,
    stimulus: task.realQuestionStimulus || '(지문 없음)',
    options: task.realQuestionOptions,
    correct_answer: task.correctAnswer,
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const client = getNextClient();
    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content ?? '';
      const result = extractJson(content) as EnrichResult;
      const validation = validateResult(result);

      if (!validation.valid) {
        console.warn(
          `  ⚠️  [${task.name}] 시도 ${attempt}/${MAX_RETRIES} — 검증 실패: ${validation.warnings.join(' | ')}`,
        );
        continue;
      }

      return result;
    } catch (err: any) {
      if (attempt < MAX_RETRIES) {
        console.warn(
          `  ⚠️  [${task.name}] 시도 ${attempt}/${MAX_RETRIES} 실패 (${err.message?.slice(0, 80)}), 재시도...`,
        );
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      } else {
        console.error(`  ❌ [${task.name}] 최대 재시도 초과: ${err.message}`);
      }
    }
  }

  return null;
}

// ── 배치 처리 ─────────────────────────────────────────────────────────────────
async function processBatch(tasks: Task[]): Promise<Map<Task, EnrichResult>> {
  const results = new Map<Task, EnrichResult>();
  let completed = 0;

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (task) => {
        const result = await enrichConcept(task);
        completed++;
        const status = result ? '✅' : '❌';
        console.log(
          `  ${status} [${completed}/${tasks.length}] ${task.subjectSlug}/${task.unitNumber}단원 — ${task.name}`,
        );
        return { task, result };
      }),
    );

    for (const { task, result } of batchResults) {
      if (result) results.set(task, result);
    }

    // API rate limit 방지
    if (i + CONCURRENCY < tasks.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}

// ── Supabase 저장 ─────────────────────────────────────────────────────────────
async function saveToSupabase(task: Task, result: EnrichResult): Promise<void> {
  // real_question JSONB 조회 후 concept_usage만 추가
  const { data: current } = await supabase!
    .from('textbook_concept_cards')
    .select('real_question')
    .eq('id', task.cardId)
    .single();

  const updatedRealQ = {
    ...((current?.real_question as Record<string, unknown>) || {}),
    conceptUsage: result.concept_usage,
  };

  const { error } = await supabase!
    .from('textbook_concept_cards')
    .update({
      enriched_definition: result.enriched_definition,
      key_points: result.key_points,
      caution: result.caution,
      real_question: updatedRealQ as any,
    })
    .eq('id', task.cardId);

  if (error) {
    console.error(`  ❌ [${task.name}] Supabase 저장 실패: ${error.message}`);
    return;
  }

  console.log(`  💾 [${task.name}] 저장 완료`);
}

// ── 데이터 수집 ───────────────────────────────────────────────────────────────
async function collectTasks(args: ReturnType<typeof parseArgs>): Promise<Task[]> {
  const tasks: Task[] = [];

  if (!args.subject) {
    console.error('❌ --subject가 필요합니다. (success 또는 industry)');
    process.exit(1);
  }

  const dbSubject = SUBJECT_MAP[args.subject];
  if (!dbSubject) {
    console.error(`❌ 알 수 없는 과목: ${args.subject}. 가능: ${Object.keys(SUBJECT_MAP).join(', ')}`);
    process.exit(1);
  }

  // unit_id 조회
  let unitQuery = supabase!
    .from('textbook_units')
    .select('id, unit_number')
    .eq('subject', dbSubject);

  if (args.unit) {
    unitQuery = unitQuery.eq('unit_number', args.unit);
  }

  const { data: units } = await unitQuery;
  if (!units?.length) {
    console.error(`❌ ${args.subject}/${args.unit ?? '*'}에 해당하는 단원이 없습니다.`);
    process.exit(1);
  }

  for (const unit of units) {
    let cardQuery = supabase!
      .from('textbook_concept_cards')
      .select('id, name, unit_id, definition, textbook_excerpt, real_question, enriched_definition')
      .eq('unit_id', unit.id)
      .order('rank');

    const { data: cards } = await cardQuery;
    if (!cards?.length) continue;

    for (const card of cards) {
      // enriched_definition이 이미 있으면 스킵 (--force 아닌 경우)
      if (card.enriched_definition && !args.force) continue;

      const realQ = (card.real_question as any)?.questionData;
      if (!realQ) {
        // real_question 없어도 enrichment는 가능 (concept_usage만 없어짐)
        if (!args.force) continue;
      }

      tasks.push({
        cardId: card.id,
        name: card.name,
        unitNumber: unit.unit_number,
        subjectSlug: args.subject!,
        definition: card.definition || '',
        textbookExcerpt: card.textbook_excerpt || '',
        realQuestionStem: realQ?.render_ready?.question_stem || realQ?.stem || '',
        realQuestionStimulus: realQ
          ? realQ.stimulus || stimulusDataToPlainText(realQ.render_ready?.stimulus_data) || null
          : null,
        realQuestionOptions: realQ?.render_ready?.options_list || realQ?.options || [],
        correctAnswer: realQ ? parseCorrectAnswer(realQ.correct_answer ?? realQ.answer) : 1,
      });

      if (args.limit > 0 && tasks.length >= args.limit) break;
    }

    if (args.limit > 0 && tasks.length >= args.limit) break;
  }

  return tasks;
}

// ── 메인 ───────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();

  console.log('📋 설정:');
  console.log(`   과목: ${args.subject ?? '전체'}`);
  console.log(`   단원: ${args.unit ?? '전체'}`);
  console.log(`   모델: ${MODEL}`);
  console.log(`   Force: ${args.force}`);
  console.log(`   Dry run: ${args.dryRun}`);
  console.log(`   병렬: ${CONCURRENCY}, API키: ${API_KEYS.length}개\n`);

  const tasks = await collectTasks(args);

  if (args.dryRun) {
    console.log(`\n📊 Dry run 결과:`);
    console.log(`   대상: ${tasks.length}개`);
    if (tasks.length === 0) {
      console.log('   처리할 항목이 없습니다. (--force로 기존 데이터 재생성 가능)');
    }
    return;
  }

  if (tasks.length === 0) {
    console.log('처리할 항목 없음. (--force 플래그 사용 시 기존 데이터도 재생성)');
    return;
  }

  console.log(`\n🎯 총 ${tasks.length}개 개념 처리 예정\n`);
  console.log('계속하려면 5초 내에 Ctrl+C를 누르세요...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const results = await processBatch(tasks);

  // 저장
  let savedCount = 0;
  for (const [task, result] of results) {
    await saveToSupabase(task, result);
    savedCount++;
  }

  console.log(`\n📊 완료: ${savedCount}/${tasks.length}개 저장됨`);
}

main().catch(console.error);
