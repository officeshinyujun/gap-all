/**
 * 특기입증자료 그림 5-9 자료 생성용 스크립트.
 *
 * 같은 교과 내용·같은 모델·같은 프롬프트로 문항을 두 번 생성한다.
 *   A) guard-off — "절대 금지 사항"(개념명 노출 금지) 블록을 뺀 프롬프트
 *   B) guard-on  — 현재 서비스와 동일한 프롬프트
 * 두 결과를 artifacts/deck/question-compare.json 에 남긴다.
 *
 * 프롬프트 본문은 src/chat/chat-ai.service.ts 의 generateExamQuestion 과 동일하게 맞췄고,
 * 교과 내용만 DB 대신 textbook/*_summation_v2 파일에서 직접 읽는다.
 *
 * 실행:
 *   cd backend && node -r ts-node/register scripts/deck-question-compare.ts
 * 옵션:
 *   --subject=success|industry   (기본 success)
 *   --unit=4                     (기본 4)
 *   --topic=근로계약              (기본 근로계약)
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { getOpenAIClient } from '../src/lib/openai-keys';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
) as Record<string, string>;

const SUBJECTS: Record<string, { title: string; dir: string }> = {
  success: { title: '성공적인 직업생활', dir: 'sungjik_summation_v2' },
  industry: { title: '공업 일반', dir: 'kongil_summation_v2' },
};

const subjectSlug = args.subject ?? 'success';
const unit = Number(args.unit ?? 4);
const topic = args.topic ?? '근로계약';
const subject = SUBJECTS[subjectSlug];
if (!subject) throw new Error(`알 수 없는 과목: ${subjectSlug}`);

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';
const ROOT = path.resolve(__dirname, '..', '..');

function extractTextFromSummation(raw: string): string {
  const jsonStr = raw.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  const data = JSON.parse(jsonStr);
  const cards: any[] = data.cards ?? [];
  const sections: string[] = [];
  for (const card of cards) {
    const c = card.content;
    if (!c) continue;
    const parts: string[] = [];
    if (c.title) parts.push(`## ${c.title}`);
    if (c.description) parts.push(c.description);
    if (c.body) parts.push(c.body);
    if (c.integrated_data?.table) parts.push(c.integrated_data.table);
    if (c.integrated_data?.logic_flow) parts.push(c.integrated_data.logic_flow);
    if (c.integrated_data?.visual_analysis) parts.push(c.integrated_data.visual_analysis);
    if (Array.isArray(c.bullet_points) && c.bullet_points.length > 0) {
      parts.push(c.bullet_points.map((bp: string) => `- ${bp}`).join('\n'));
    }
    if (Array.isArray(c.trap_points) && c.trap_points.length > 0) {
      parts.push(`주의: ${c.trap_points.join(', ')}`);
    }
    if (Array.isArray(c.key_concepts)) {
      for (const kc of c.key_concepts) {
        if (kc.name) parts.push(`### ${kc.name}`);
        if (kc.definition) parts.push(kc.definition);
        if (Array.isArray(kc.key_points)) parts.push(kc.key_points.map((kp: string) => `- ${kp}`).join('\n'));
      }
    }
    if (parts.length > 0) sections.push(parts.join('\n'));
  }
  return sections.join('\n\n');
}

function loadContext(): string {
  const raw = fs.readFileSync(path.join(ROOT, 'textbook', subject.dir, `${unit}단원.json`), 'utf8');
  return `[${unit}단원]\n${extractTextFromSummation(raw).slice(0, 2000)}`;
}

function buildPrompt(withGuard: boolean, textbookContext: string): string {
  const rangeText = `${unit}단원`;
  return [
    `당신은 "${subject.title}" 과목의 수능/모의고사 문제 출제 전문가입니다.`,
    `특성화고 학생들의 사고력을 측정하는 객관식 문제를 출제합니다.`,
    ``,
    `## 핵심 출제 원칙`,
    `- 아래 [교과 내용]을 바탕으로 문제를 출제하세요.`,
    `- 문제 범위: ${rangeText} — 반드시 이 범위의 내용에서만 출제하세요.`,
    `- 사용자가 요청한 주제: "${topic}"`,
    ``,
    ...(withGuard
      ? [
          `## ⚠️ 절대 금지 사항`,
          `1. 문제 발문, 지문, 선택지 어디에도 "${topic}"이나 개념명을 직접 언급하지 마세요.`,
          `2. "근로기준법", "근로계약", "해고" 등의 개념 용어 자체를 문제에 쓰지 마세요.`,
          `3. 학생이 개념을 스스로 도출할 수 있도록, 상황/사례/판례를 통해 간접적으로 물어보세요.`,
          `4. 예: "근로기준법"을 묻고 싶으면 → "다음 중 근로자의 권리를 침해한 사례로 옳은 것은?"`,
          `5. 위 [교과 내용]에 포함된 ${rangeText} 범위 밖의 내용은 절대 사용하지 마세요.`,
          ``,
        ]
      : []),
    `## 문제 형식`,
    `- 수능 스타일: 발문 → 사례/지문 → 필요시 보기(ㄱㄴㄷ) → 5지선다`,
    `- 실제 시험 난이도로 출제`,
    `- 정답은 교과 내용에 근거`,
    `- 오답지는 학생들이 자주 헷갈리는 개념으로 구성`,
    ``,
    `## 교과 내용 (${rangeText})`,
    textbookContext,
    ``,
    ``,
    `## 해설 작성 지침`,
    `- 해설(explanation)에서 비로소 "${topic}" 개념을 밝히고 설명하세요.`,
    `- 왜 정답인지, 각 오답이 왜 틀렸는지 간결하게 설명하세요.`,
    `- "이 문제는 ~개념을 묻는 문제입니다"로 시작하세요.`,
    ``,
    `## 출력 형식 (JSON ONLY, 코드블럭 없이 순수 JSON)`,
    `{`,
    `  "question_stem": "question text",`,
    `  "stimulus": "case study or passage, empty string if none",`,
    `  "combo_title": "title for combo block, empty if none",`,
    `  "combo_items": [{"key": "ㄱ", "text": "item text"}],`,
    `  "options": ["(1) option1", "(2) option2", "(3) option3", "(4) option4", "(5) option5"],`,
    `  "correct_answer": 3,`,
    `  "explanation": "explain why correct, why each wrong answer is wrong",`,
    `  "target_concept": "the core concept name being tested",`,
    `  "difficulty": "하 or 중 or 상"`,
    `}`,
  ].join('\n');
}

function parse(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : content;
  try {
    return JSON.parse(body.trim());
  } catch {
    return { _parseFailed: true, raw: content };
  }
}

async function run(withGuard: boolean, textbookContext: string) {
  const systemPrompt = buildPrompt(withGuard, textbookContext);
  const res = await getOpenAIClient().chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: topic },
    ],
  });
  const content = res.choices[0]?.message?.content ?? '{}';
  return {
    guard: withGuard,
    model: MODEL,
    promptChars: systemPrompt.length,
    usage: res.usage ?? null,
    question: parse(content),
  };
}

(async () => {
  const ctx = loadContext();
  const probe = getOpenAIClient() as unknown as { baseURL?: string };
  console.log(`baseURL   : ${probe.baseURL ?? '(기본값)'}`);
  console.log(`proxy env : ${['HTTPS_PROXY','https_proxy','HTTP_PROXY','http_proxy','ALL_PROXY','all_proxy','OPENAI_BASE_URL']
    .map((k) => (process.env[k] ? `${k}=${process.env[k]}` : null)).filter(Boolean).join(' | ') || '(없음)'}`);
  console.log(`과목 ${subject.title} / ${unit}단원 / 주제 "${topic}" / 모델 ${MODEL}`);
  console.log(`교과 내용 ${ctx.length}자\n`);

  const off = await run(false, ctx);
  console.log('guard-off 생성 완료');
  const on = await run(true, ctx);
  console.log('guard-on  생성 완료');

  const out = {
    generatedAt: new Date().toISOString(),
    subject: subject.title,
    subjectSlug,
    unit,
    topic,
    model: MODEL,
    note: '두 결과의 차이는 프롬프트의 "절대 금지 사항" 블록 유무뿐이다.',
    guardOff: off,
    guardOn: on,
  };

  const dir = path.join(__dirname, '..', 'artifacts', 'deck');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'question-compare.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n→ ${file}`);
  console.log('\n[guard-off] 발문:', (off.question as any)?.question_stem);
  console.log('[guard-on ] 발문:', (on.question as any)?.question_stem);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
