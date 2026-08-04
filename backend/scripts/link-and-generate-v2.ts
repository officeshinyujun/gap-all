/**
 * link-and-generate-v2.ts
 *
 * Phase 5-7: 개념과 실제 문제를 연결하고, 개념별 상세 콘텐츠를 생성합니다.
 *
 * 단계:
 * 1. 추출된 개념 목록 로드
 * 2. 정규화된 실제 문제와 연결 (키워드 매칭 + AI 판정)
 * 3. 개념별 상세 설명·핵심 포인트·출제 패턴·오답 주의 생성
 * 4. 단원별 concept-cards.json으로 저장 (기존 format 호환)
 * 5. 생성 비용 추적
 *
 * 사용법:
 *   npx ts-node --project tsconfig.json scripts/link-and-generate-v2.ts
 *     --subject success
 *     --unit 1              (선택)
 *     --limit 3             (선택: 최대 단원 수)
 *     --dry-run
 *     --skip-generate       (연결만 수행, 콘텐츠 생성 스킵)
 */

import OpenAI from 'openai';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ── 설정 ──────────────────────────────────────────────────────────────────────
const API_KEYS = [
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_API_KEY2,
  process.env.OPENAI_API_KEY3,
].filter((k): k is string => typeof k === 'string' && k.length > 0);

const clients = API_KEYS.map((key) => new OpenAI({ apiKey: key }));
let clientIndex = 0;
function getNextClient() { return clients[clientIndex++ % clients.length]; }

const MODEL_LINK = 'gpt-4o-mini';
const MODEL_GENERATE = process.env.OPENAI_GENERATE_MODEL ?? 'gpt-4o-mini';
const TEXTBOOK_BASE = path.resolve(__dirname, '..', '..', 'textbook');
const CONCURRENCY = 3;
const MAX_RETRIES = 3;

// ── Types ─────────────────────────────────────────────────────────────────────
interface ConceptWithQuestions {
  canonicalName: string;
  aliases: string[];
  isPrimary: boolean;
  evidence: { sectionId?: string; quote: string }[];
  subtopics: string[];
  linkedQuestions: LinkedQuestion[];
}

interface LinkedQuestion {
  questionId: string;
  sourceExam: string;
  questionNumber: number;
  relation: 'PRIMARY' | 'SECONDARY' | string;
  confidence: number;
  evidenceQuote: string;
}

interface GeneratedContent {
  definitionMarkdown: string;
  keyPointsMarkdown: string[];
  examPatternsMarkdown: string[];
  commonTrapsMarkdown: string;
  questionAnalyses: QuestionAnalysis[];
}

interface QuestionAnalysis {
  questionId: string;
  stimulusClues: { quote: string; why: string }[];
  optionAnalysis: { optionNum?: number; optionKey?: string; verdict: string; reasoning: string }[];
  solvingFlow: { step: number; action: string }[];
  takeaway: string;
}

interface CostTracker {
  linkPromptTokens: number;
  linkCompletionTokens: number;
  generatePromptTokens: number;
  generateCompletionTokens: number;
}

const cost = { linkPromptTokens: 0, linkCompletionTokens: 0, generatePromptTokens: 0, generateCompletionTokens: 0 };

// ── Utils ─────────────────────────────────────────────────────────────────────
function extractJson(text: string): any {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = codeBlock ? codeBlock[1].trim() : text.trim();
  return JSON.parse(raw);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 1: 개념-문제 연결 (키워드 + AI)
// ═══════════════════════════════════════════════════════════════════════════════
function keywordMatch(concept: any, question: any): number {
  const keywords = [
    concept.canonicalName,
    ...(concept.aliases || []),
    ...(concept.subtopics || []),
  ].filter(Boolean).map((k: string) => k.toLowerCase());

  const qText = [
    question.stem, question.stimulus,
    ...(question.options || []), question.explanation,
  ].join(' ').toLowerCase();

  let score = 0;
  for (const kw of keywords) {
    if (!kw || kw.length < 2) continue;
    const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = qText.match(regex);
    if (matches) score += matches.length * (kw.length >= 4 ? 3 : 1);
  }
  return score;
}

async function linkWithAI(concept: any, candidates: any[]): Promise<LinkedQuestion[]> {
  if (candidates.length === 0) return [];
  if (candidates.length === 1 && keywordMatch(concept, candidates[0]) > 5) {
    return [makeLink(concept, candidates[0], 'PRIMARY', 0.8)];
  }

  const userContent = JSON.stringify({
    concept: concept.canonicalName,
    aliases: concept.aliases || [],
    candidates: candidates.slice(0, 8).map((q: any) => ({
      id: q.id,
      source: q.sourceExam,
      stem: (q.stem || '').slice(0, 150),
      stimulus: (q.stimulus || '').slice(0, 200),
      options: (q.options || []).join(' | '),
    })),
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const client = getNextClient();
    try {
      const response = await client.chat.completions.create({
        model: MODEL_LINK,
        messages: [
          { role: 'system', content: '당신은 개념과 시험 문제를 연결하는 전문가입니다. 주어진 개념이 각 문제에 PRIMARY(핵심), SECONDARY(보조), 또는 NONE(무관)인지 판정하세요. JSON만 출력하세요.' },
          { role: 'user', content: userContent },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content);
      cost.linkPromptTokens += response.usage?.prompt_tokens ?? 0;
      cost.linkCompletionTokens += response.usage?.completion_tokens ?? 0;

      const links: LinkedQuestion[] = (parsed.links || parsed.results || []).map((l: any) => ({
        questionId: l.questionId || l.id || '',
        sourceExam: candidates.find((c: any) => c.id === (l.questionId || l.id))?.sourceExam || '',
        questionNumber: candidates.find((c: any) => c.id === (l.questionId || l.id))?.questionNumber || 0,
        relation: l.relation === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY',
        confidence: l.confidence || 0.7,
        evidenceQuote: l.evidenceQuote || l.reason || '',
      }));
      // 현재 카드 UX는 개념당 대표 실전 문제 1개를 사용한다.
      // 후보를 여러 개 평가하더라도 confidence가 가장 높은 문제만 연결한다.
      return links
        .filter((l) => l.relation !== 'NONE')
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 1);
    } catch { /* retry */ }
  }
  return [];
}

function makeLink(concept: any, question: any, relation: 'PRIMARY' | 'SECONDARY', confidence: number): LinkedQuestion {
  return {
    questionId: question.id,
    sourceExam: question.sourceExam,
    questionNumber: question.questionNumber,
    relation,
    confidence,
    evidenceQuote: '',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 2: 개념 콘텐츠 생성
// ═══════════════════════════════════════════════════════════════════════════════
function buildGeneratePrompt(concept: any, unit: any, questions: any[]): string {
  const structText = (unit.structuredSections || []).map((s: any) => {
    const subs = (s.subsections || []).filter((sub: any) =>
      sub.title.includes(concept.canonicalName) ||
      concept.aliases?.some((a: string) => sub.title.includes(a)) ||
      concept.subtopics?.some((st: string) => sub.title.includes(st))
    );
    return subs.map((sub: any) => [
      `### ${sub.title}`,
      sub.explanation || '',
      `핵심 포인트: ${(sub.keyPoints || []).join(' | ')}`,
      `시험 포인트: ${(sub.examPoints || []).join(' | ')}`,
      sub.visualGuide || '',
    ].filter(Boolean).join('\n')).join('\n\n');
  }).flat().join('\n\n');

  const qText = questions.slice(0, 3).map((q: any, idx: number) => {
    const text = [
      `[문제 ${idx + 1}] 출처: ${q.sourceExam} ${q.questionNumber}번`,
      `발문: ${(q.stem || '').slice(0, 200)}`,
      q.stimulus ? `자료: ${q.stimulus.slice(0, 300)}` : '',
      `선택지: ${(q.options || []).join(' | ')}`,
      `정답: ${q.correctAnswer}번`,
      q.explanation ? `해설: ${q.explanation.slice(0, 200)}` : '',
    ];
    return text.filter(Boolean).join('\n');
  }).join('\n\n---\n\n');

  return `# Role: 수능 직업탐구 개념 해설 전문가
# Context: 수능특강 교재 내용과 실제 기출문제를 모두 참고하여 개념을 상세히 설명하라.

## 개념 정보
- 개념명: ${concept.canonicalName}
- 별칭: ${(concept.aliases || []).join(', ') || '없음'}
${concept.isPrimary ? '- 이 개념은 단원의 핵심 개념입니다.' : '- 이 개념은 보조/하위 개념입니다.'}
- 하위 주제: ${(concept.subtopics || []).join(', ') || '없음'}
- 교재 근거: ${(concept.evidence || []).map((e: any) => e.quote).join(' | ')}

## 구조화된 교재 데이터 (관련 부분만)
${structText.slice(0, 3000) || '(관련 데이터 없음)'}

## 실제 출제 문제
${qText.slice(0, 4000) || '(연결된 문제 없음)'}

# [Output JSON Schema]
{
  "definitionMarkdown": "개념의 정의와 자세한 설명 (Markdown, 200~600자). ## 개요, ## 핵심 내용 형식으로. 교재 표현을 인용하고 실제 문제 맥락 포함할 것.",
  "keyPointsMarkdown": [
    "- **핵심1**: 설명 (Markdown, 실전 팁 형식)",
    "- **핵심2**: 설명"
  ],
  "examPatternsMarkdown": [
    "- **출제 유형1**: 설명 (이 개념이 시험에서 어떻게 나오는지)",
    "- **출제 유형2**: 설명"
  ],
  "commonTrapsMarkdown": "수험생이 가장 흔히 하는 실수 1가지 (구체적)",
  "questionAnalyses": [
    {
      "questionId": "문제ID",
      "stimulusClues": [{"quote": "지문 인용", "why": "왜 단서인지"}],
      "optionAnalysis": [{"optionNum": 1, "verdict": "O 또는 X", "reasoning": "이유"}],
      "solvingFlow": [{"step": 1, "action": "풀이 단계"}],
      "takeaway": "핵심 교훈"
    }
  ]
}

# [작성 규칙]
1. **definitionMarkdown**: Markdown 형식. "이 문제에서"와 같은 구체적 맥락을 포함할 것.
2. **keyPointsMarkdown**: 3~5개, 각각 "- **키워드**: 설명" 형식. 암기용이 아닌 실전 문제 풀이 팁.
3. **examPatternsMarkdown**: 1~3개. 구체적인 문제 유형과 함정 패턴을 설명.
4. **commonTrapsMarkdown**: 추상적이지 않고 구체적인 오답 사례 1개.
5. **questionAnalyses**: 연결된 문제가 있으면 각 문제에 대해 분석. 없으면 빈 배열.
   - optionNum 또는 optionKey 사용 (보기 ㄱㄴㄷ 있으면 optionKey)
   - verdict는 반드시 "O" 또는 "X"
   - quote는 원문 그대로 (축약 금지)

정확히 JSON만 출력하라.`;
}

async function generateContent(
  concept: any, unit: any, questions: any[],
): Promise<GeneratedContent | null> {
  const prompt = buildGeneratePrompt(concept, unit, questions);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const client = getNextClient();
    try {
      const response = await client.chat.completions.create({
        model: MODEL_GENERATE,
        messages: [
          { role: 'system', content: '정확히 JSON만 출력하라. 부연 설명 없이. 모든 필드를 채워라.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content ?? '';
      cost.generatePromptTokens += response.usage?.prompt_tokens ?? 0;
      cost.generateCompletionTokens += response.usage?.completion_tokens ?? 0;

      const parsed = extractJson(content);

      if (!parsed.definitionMarkdown || parsed.definitionMarkdown.length < 30) {
        console.warn(`    ⚠️  시도 ${attempt}: definitionMarkdown 너무 짧음`);
        continue;
      }

      return {
        definitionMarkdown: parsed.definitionMarkdown || '',
        keyPointsMarkdown: parsed.keyPointsMarkdown || [],
        examPatternsMarkdown: parsed.examPatternsMarkdown || [],
        commonTrapsMarkdown: parsed.commonTrapsMarkdown || parsed.caution || '',
        questionAnalyses: parsed.questionAnalyses || [],
      };
    } catch (err: any) {
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 메인
// ═══════════════════════════════════════════════════════════════════════════════
function parseArgs() {
  const args: any = { limit: 0, dryRun: false, skipGenerate: false };
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--subject' && process.argv[i + 1]) args.subject = process.argv[++i];
    else if (process.argv[i] === '--unit' && process.argv[i + 1]) args.unit = parseInt(process.argv[++i], 10);
    else if (process.argv[i] === '--limit' && process.argv[i + 1]) args.limit = parseInt(process.argv[++i], 10);
    else if (process.argv[i] === '--dry-run') args.dryRun = true;
    else if (process.argv[i] === '--skip-generate') args.skipGenerate = true;
  }
  return args;
}

async function main() {
  const args = parseArgs();
  if (!args.subject) { console.error('❌ --subject 필요'); process.exit(1); }

  const normDir = path.join(TEXTBOOK_BASE, '_v2', 'normalized', args.subject);
  const conceptFile = path.join(normDir, 'concept-candidates.json');
  const unitFile = path.join(normDir, 'units.json');
  const questionFile = path.join(normDir, 'questions.json');

  for (const f of [conceptFile, unitFile, questionFile]) {
    if (!fs.existsSync(f)) { console.error(`❌ ${f} 없음`); process.exit(1); }
  }

  const conceptUnits: any[] = JSON.parse(fs.readFileSync(conceptFile, 'utf-8'));
  const allUnits: any[] = JSON.parse(fs.readFileSync(unitFile, 'utf-8'));
  const allQuestions: any[] = JSON.parse(fs.readFileSync(questionFile, 'utf-8'));

  let targets = conceptUnits;
  if (args.unit) targets = targets.filter(u => u.unitNumber === args.unit);
  if (args.limit > 0) targets = targets.slice(0, args.limit);

  console.log(`📋 연결+생성: ${args.subject}, ${targets.length}단원`);
  console.log(`   모델: link=${MODEL_LINK}, generate=${MODEL_GENERATE}\n`);

  if (args.dryRun) {
    for (const u of targets) {
      console.log(`  ${u.unitNumber}단원: ${u.concepts.length}개 개념`);
    }
    return;
  }

  const outputCards: any[] = [];

  for (const cu of targets) {
    const unitNumber = cu.unitNumber;
    const unit = allUnits.find(u => u.unitNumber === unitNumber);
    if (!unit) continue;

    console.log(`\n🔗 ${unitNumber}단원 연결 중...`);

    // 키워드 매칭으로 후보 필터링
    for (const concept of cu.concepts) {
      const scored = allQuestions
        .map((q: any) => ({ q, score: keywordMatch(concept, q) }))
        .filter((s: any) => s.score > 0)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 5);

      // AI 판정 (키워드 점수 높은 것만)
      const aiCandidates = scored.filter((s: any) => s.score >= 3).map((s: any) => s.q);
      if (aiCandidates.length > 0) {
        const links = await linkWithAI(concept, aiCandidates);
        concept.linkedQuestions = links;
        if (links.length > 0) {
          console.log(`  ✅ ${concept.canonicalName} → ${links.length}문제 (${links[0].sourceExam})`);
        }
      } else {
        concept.linkedQuestions = [];
      }
    }

    // 콘텐츠 생성
    if (!args.skipGenerate) {
      console.log(`\n📝 ${unitNumber}단원 콘텐츠 생성 중...`);
      const generated: any[] = [];

      for (const concept of cu.concepts) {
        const linkedQs = (concept.linkedQuestions || [])
          .map((l: LinkedQuestion) => allQuestions.find(q => q.id === l.questionId))
          .filter(Boolean);

        const content = await generateContent(concept, unit, linkedQs);
        if (content) {
          generated.push({
            rank: cu.concepts.indexOf(concept) + 1,
            name: concept.canonicalName,
            frequency: linkedQs.length,
            sources: [...new Set(linkedQs.map((q: any) => q.sourceExam))],
            questionFormats: [],
            description: content.definitionMarkdown,
            keyPoints: content.keyPointsMarkdown,
            examTips: content.examPatternsMarkdown,
            conceptContent: [
              `## 개념 정의\n${content.definitionMarkdown}`,
              content.keyPointsMarkdown.length > 0 ? `## 핵심 포인트\n${content.keyPointsMarkdown.map((p: string) => `- ${p}`).join('\n')}` : '',
              content.examPatternsMarkdown.length > 0 ? `## 실제 출제 패턴\n${content.examPatternsMarkdown.map((p: string) => `- ${p}`).join('\n')}` : '',
              content.commonTrapsMarkdown ? `## ⚠️ 오답 주의\n${content.commonTrapsMarkdown}` : '',
            ].filter(Boolean).join('\n\n'),
            sampleQuestion: linkedQs.length > 0 ? {
              metadata: {
                source_exam: linkedQs[0].sourceExam,
                question_number: linkedQs[0].questionNumber,
                target_concept: concept.canonicalName,
              },
              render_ready: {
                question_stem: linkedQs[0].stem || '',
                stimulus_data: linkedQs[0].stimulus ? { content: linkedQs[0].stimulus } : null,
                options_list: linkedQs[0].options || [],
                explanation: linkedQs[0].explanation || '',
              },
              correct_answer: linkedQs[0].correctAnswer,
              questionSource: linkedQs[0].sourceExam,
              questionNumber: linkedQs[0].questionNumber,
              rawStimulus: linkedQs[0].stimulus || '',
            } : null,
            conceptHighlightV2: content.questionAnalyses.length > 0 ? content.questionAnalyses[0] : null,
            relatedQuestions: linkedQs.map((q: any, idx: number) => ({
              id: q.id,
              questionSource: q.sourceExam,
              questionNumber: q.questionNumber,
              correct_answer: q.correctAnswer,
              rawStimulus: q.stimulus || '',
              conceptHighlightV2: content.questionAnalyses[idx] || null,
              question: {
                metadata: { source_exam: q.sourceExam, question_number: q.questionNumber },
                render_ready: {
                  question_stem: q.stem || '',
                  stimulus_data: q.stimulus ? { content: q.stimulus } : null,
                  options_list: q.options || [],
                  explanation: q.explanation || '',
                },
              },
            })),
          });
          console.log(`  ✅ ${concept.canonicalName} (${linkedQs.length}문제, ${content.questionAnalyses.length}분석)`);
        }
      }

      unit.concepts = generated;
      outputCards.push(unit);
    }
  }

  // 저장
  const outPath = path.join(normDir, 'concept-cards-generated.json');
  fs.writeFileSync(outPath, JSON.stringify(outputCards, null, 2));

  const linkCost = (cost.linkPromptTokens / 1e6) * 0.15 + (cost.linkCompletionTokens / 1e6) * 0.60;
  const genCost = (cost.generatePromptTokens / 1e6) * 0.15 + (cost.generateCompletionTokens / 1e6) * 0.60;
  console.log(`\n📊 연결: ${cost.linkPromptTokens}/${cost.linkCompletionTokens}t, 생성: ${cost.generatePromptTokens}/${cost.generateCompletionTokens}t`);
  console.log(`💰 연결 비용: $${linkCost.toFixed(4)}, 생성 비용: $${genCost.toFixed(4)}, 합계: $${(linkCost + genCost).toFixed(4)}`);
  console.log(`💾 저장: ${outPath}`);
}

main().catch(console.error);
