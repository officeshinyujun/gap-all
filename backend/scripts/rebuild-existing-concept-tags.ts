/**
 * rebuild-existing-concept-tags.ts
 *
 * 기존 대표 태그(canonical concept)를 유지하면서
 * 세부 개념·실제 출제 포인트·대표 문제를 보강합니다.
 *
 * 동작:
 * 1. 기존 concept_cards JSON 로드
 * 2. 단원별 실제 문제 + 구조화 개념 데이터 로드
 * 3. 각 태그의 세부 개념(subtopics)을 교재 원문에서 추출
 * 4. 대표 문제 1개 선정
 * 5. OpenAI로 상세 설명·핵심 포인트·출제 패턴·오답 주의 생성
 * 6. DB에 저장
 *
 * 사용법:
 *   npx ts-node --project tsconfig.json scripts/rebuild-existing-concept-tags.ts
 *     --subject success
 *     --unit 1
 *     --dry-run
 *     --generate       (콘텐츠 생성까지 실행, 없으면 태그 분석만)
 *
 * 출력:
 *   textbook/_v2/rebuild/{subject}/concept-tags-enriched.json
 */

import OpenAI from 'openai';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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

const MODEL_ANALYZE = 'gpt-4o-mini';
const MODEL_GENERATE = process.env.OPENAI_GENERATE_MODEL ?? 'gpt-4o-mini';
const TEXTBOOK_BASE = path.resolve(__dirname, '..', '..', 'textbook');
const MAX_RETRIES = 3;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const SUBJECT_MAP: Record<string, { folder: string; kor: string; dbSubject: string }> = {
  success: { folder: 'sungjik', kor: '성공적인 직업생활', dbSubject: 'sungjik' },
  industry: { folder: 'kongil', kor: '공업 일반', dbSubject: 'kongil' },
};

// ── Utils ─────────────────────────────────────────────────────────────────────
function extractJson(text: string): any {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = codeBlock ? codeBlock[1].trim() : text.trim();
  return JSON.parse(raw);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 데이터 로드
// ═══════════════════════════════════════════════════════════════════════════════
function loadConceptCards(subjectSlug: string, unitFilter?: number): any[] {
  const meta = SUBJECT_MAP[subjectSlug];
  const candidates = [
    path.join(TEXTBOOK_BASE, `${subjectSlug}_cards_moi`),
    path.join(TEXTBOOK_BASE, `${meta.folder}_cards_moi`),
  ];
  let cardDir = '';
  for (const c of candidates) { if (fs.existsSync(c)) { cardDir = c; break; } }
  if (!cardDir) return [];

  const allConcepts: any[] = [];

  for (const file of fs.readdirSync(cardDir)) {
    const m = file.match(/(\d+)단원/);
    if (!m) continue;
    const un = parseInt(m[1], 10);
    if (unitFilter && un !== unitFilter) continue;

    try {
      const data = JSON.parse(fs.readFileSync(path.join(cardDir, file), 'utf-8'));
      for (const c of (data.concepts || [])) {
        allConcepts.push({ ...c, _unitNumber: un });
      }
    } catch {/* skip */}
  }

  return allConcepts;
}

function loadStructuredSections(subjectSlug: string, unitNumber: number): any[] {
  const meta = SUBJECT_MAP[subjectSlug];
  const file = path.join(TEXTBOOK_BASE, `${meta.folder}_structured`, `${unitNumber}단원.json`);
  if (!fs.existsSync(file)) return [];
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return d.sections || [];
  } catch { return []; }
}

function loadQuestions(subjectSlug: string): any[] {
  const meta = SUBJECT_MAP[subjectSlug];
  const file = path.join(TEXTBOOK_BASE, '_v2', 'normalized', subjectSlug, 'questions.json');
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 1: 세부 개념 분석 (기존 태그 이름 변경 X)
// ═══════════════════════════════════════════════════════════════════════════════
function buildAnalyzePrompt(concept: any, structSections: any[], questions: any[]): string {
  const card = concept.card || {};
  const rq = concept.realQuestion || {};
  const qd = rq.questionData || {};

  const structText = structSections.map((s: any) => {
    const subs = (s.subsections || []).map((sub: any) =>
      `### ${sub.title}\n${sub.explanation || ''}\n포인트: ${(sub.keyPoints || []).join(' | ')}\n출제: ${(sub.examPoints || []).join(' | ')}`
    ).join('\n\n');
    return `## ${s.title}\n${subs}`;
  }).join('\n\n');

  const qSamples = questions.slice(0, 8).map((q: any, idx: number) =>
    `[후보${idx + 1}] ${q.sourceExam} ${q.questionNumber}번\n발문: ${(q.stem || '').slice(0, 150)}\n자료: ${(q.stimulus || '').slice(0, 150)}\n선택지: ${(q.options || []).join(' | ')}\n정답: ${q.correctAnswer}`
  ).join('\n\n');

  return `# Role: 수능 직업탐구 개념 분석 전문가
# Context: 주어진 대표 개념 태그와 실제 문제들을 분석하여 세부 개념과 대표 문제를 선정하라.

## [대표 태그]
- 태그명: ${concept.name}
- 빈출도: ${concept.frequency || 0}회
- 기존 정의: ${(card.definition || '').slice(0, 300)}
- 기존 핵심 포인트: ${(card.keyPoints || []).join(' | ')}
- 기존 교과서 원문: ${(card.textbookExcerpt || '').slice(0, 400)}
- 기존 출제 설명: ${(rq.conceptUsage || '').slice(0, 300)}

## [구조화 교재 데이터]
${structText.slice(0, 4000) || '(없음)'}

## [연결 가능한 실제 문제 후보]
${qSamples.slice(0, 5000)}

# [출력 JSON]
{
  "subtopics": [
    {"name": "세부개념명", "evidence": "교재 근거 인용구", "examRelevance": "시험에서의 활용 설명"}
  ],
  "representativeQuestionIndex": 0,
  "representativeQuestionReason": "이 문제가 대표로 적합한 이유",
  "examPatterns": ["출제 패턴1", "출제 패턴2"],
  "caution": "수험생이 가장 흔히 하는 실수"
}

# [규칙]
- 대표 태그명(${concept.name})은 절대 변경하지 마라.
- subtopics는 3~7개. 교재에서 실제로 설명되고 문제에서 출제되는 것만.
- representativeQuestionIndex는 후보 문제의 0-based 인덱스. 가장 개념을 잘 나타내는 1개만.
- examPatterns는 1~3개. 구체적인 문제 유형.
- evidence는 반드시 교재 원문의 실제 표현을 인용.
- 정확히 JSON만 출력.`;
}

async function analyzeConcept(
  concept: any, unitNumber: number, subjectSlug: string
): Promise<any | null> {
  const structSections = loadStructuredSections(subjectSlug, unitNumber);
  const allQuestions = loadQuestions(subjectSlug);
  const questions = allQuestions.filter((q: any) => {
    const qText = [q.stem, q.stimulus, ...(q.options || [])].join(' ');
    const keywords = [
      concept.name,
      ...(concept.card?.definition || '').split(/\s+/).filter((w: string) => w.length >= 3),
    ];
    return keywords.some((kw: string) => qText.includes(kw));
  }).slice(0, 8);

  if (questions.length === 0 && structSections.length === 0) return null;

  const prompt = buildAnalyzePrompt(concept, structSections, questions);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await getNextClient().chat.completions.create({
        model: MODEL_ANALYZE,
        messages: [
          { role: 'system', content: '정확히 JSON만 출력하라.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      });

      const content = response.choices[0]?.message?.content ?? '';
      const parsed = extractJson(content);

      return {
        subtopics: parsed.subtopics || [],
        bestQuestion: questions[parsed.representativeQuestionIndex ?? 0] || questions[0] || null,
        bestQuestionReason: parsed.representativeQuestionReason || '',
        examPatterns: parsed.examPatterns || [],
        caution: parsed.caution || '',
        usage: {
          prompt_tokens: response.usage?.prompt_tokens ?? 0,
          completion_tokens: response.usage?.completion_tokens ?? 0,
        },
      };
    } catch (err: any) {
      if (attempt >= MAX_RETRIES) console.error(`  ❌ 분석 실패: ${(err as Error).message?.slice(0, 80)}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 2: 콘텐츠 생성
// ═══════════════════════════════════════════════════════════════════════════════
function buildGeneratePrompt(
  concept: any, analysis: any,
): string {
  const card = concept.card || {};
  const unitNumber = concept._unitNumber;

  const subtopicText = (analysis.subtopics || []).map((s: any) =>
    `- **${s.name}**: ${s.examRelevance || s.evidence || ''}`
  ).join('\n');

  const bestQ = analysis.bestQuestion;
  const qText = bestQ ? [
    `출처: ${bestQ.sourceExam} ${bestQ.questionNumber}번`,
    `발문: ${bestQ.stem || ''}`,
    `자료: ${(bestQ.stimulus || '').slice(0, 300)}`,
    `선택지: ${(bestQ.options || []).join(' | ')}`,
    `정답: ${bestQ.correctAnswer}번`,
    `해설: ${(bestQ.explanation || '').slice(0, 200)}`,
  ].filter(Boolean).join('\n') : '(대표 문제 없음)';

  return `# Role: 수능 직업탐구 개념 해설 전문가
# Context: 기존 대표 태그를 유지하면서 상세 설명·핵심 포인트·출제 패턴을 생성하라.

## [개념 정보]
- 대표 태그: ${concept.name}
- ${unitNumber}단원
- 빈출도: ${concept.frequency || 0}회
- 기존 정의: ${(card.definition || '').slice(0, 300)}

## [세부 개념]
${subtopicText || '(없음)'}

## [실제 출제 패턴]
${(analysis.examPatterns || []).join('\n')}

## [대표 문제]
${qText}

# [출력 JSON]
{
  "description": "자세한 개념 설명 (Markdown, 300~800자). ## 개요와 ## 핵심 내용 형식. 교재 표현 인용 + 실제 문제 맥락 포함.",
  "keyPoints": ["- **핵심1**: 설명 (Markdown, 실전 팁)", "- **핵심2**: 설명"],
  "examTips": ["- **출제유형1**: 구체적 설명", "- **출제유형2**: 구체적 설명"],
  "conceptUsage": "이 개념이 실제 시험에서 어떻게 나오는지 1~2문장",
  "caution": "수험생이 가장 흔히 하는 실수 1개 (구체적)"
}

# [규칙]
- 대표 태그명은 절대 변경하지 마라.
- description은 교재 표현을 인용하고 구체적인 문제 맥락을 포함할 것.
- keyPoints는 "문제 풀 때 이렇게 생각하라" 형식으로 3~5개.
- examTips는 실제 출제 유형을 구체적으로 1~3개.
- conceptUsage는 문제 유형과 함정 패턴을 명시.
- 정확히 JSON만 출력.`;
}

async function generateContent(concept: any, analysis: any): Promise<any | null> {
  const prompt = buildGeneratePrompt(concept, analysis);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await getNextClient().chat.completions.create({
        model: MODEL_GENERATE,
        messages: [
          { role: 'system', content: '정확히 JSON만 출력하라.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content ?? '';
      const parsed = extractJson(content);

      if (!parsed.description || parsed.description.length < 40) {
        console.warn(`    ⚠️  시도 ${attempt}: description 너무 짧음`);
        continue;
      }

      return {
        ...parsed,
        usage: {
          prompt_tokens: response.usage?.prompt_tokens ?? 0,
          completion_tokens: response.usage?.completion_tokens ?? 0,
        },
      };
    } catch (err: any) {
      if (attempt >= MAX_RETRIES) console.error(`    ❌ 생성 실패: ${(err as Error).message?.slice(0, 80)}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Step 3: 결과를 기존 format으로 조립
// ═══════════════════════════════════════════════════════════════════════════════
function buildOutputCard(concept: any, analysis: any, content: any): any {
  const card = concept.card || {};
  const bestQ = analysis.bestQuestion;

  const conceptContent = [
    content?.description ? `## 개념 정의\n${content.description}` : '',
    (content?.keyPoints || []).length > 0 ? `## 핵심 포인트\n${content.keyPoints.map((p: string) => `- ${p}`).join('\n')}` : '',
    (content?.examTips || []).length > 0 ? `## 실제 출제 패턴\n${content.examTips.map((p: string) => `- ${p}`).join('\n')}` : '',
    analysis.caution ? `## ⚠️ 오답 주의\n${analysis.caution}` : '',
  ].filter(Boolean).join('\n\n');

  return {
    name: concept.name,
    rank: concept.rank,
    frequency: concept.frequency,
    sources: concept.sources || [],
    questionFormats: [],
    description: content?.description || card.definition || '',
    keyPoints: content?.keyPoints || card.keyPoints || [],
    examTips: content?.examTips || analysis.examPatterns || [],
    conceptContent,
    sampleQuestion: bestQ ? {
      metadata: {
        source_exam: bestQ.sourceExam,
        question_number: bestQ.questionNumber,
        target_concept: concept.name,
      },
      render_ready: {
        question_stem: bestQ.stem || '',
        stimulus_data: bestQ.stimulus ? { content: bestQ.stimulus } : null,
        options_list: bestQ.options || [],
        explanation: bestQ.explanation || '',
      },
      correct_answer: bestQ.correctAnswer,
      questionSource: bestQ.sourceExam,
      questionNumber: bestQ.questionNumber,
      rawStimulus: bestQ.stimulus || '',
    } : (concept.realQuestion?.questionData ? {
      metadata: { target_concept: concept.name },
      render_ready: {
        question_stem: (concept.realQuestion.questionData.render_ready?.question_stem) || '',
        stimulus_data: concept.realQuestion.questionData.render_ready?.stimulus_data || null,
        options_list: concept.realQuestion.questionData.render_ready?.options_list || [],
        explanation: concept.realQuestion.questionData.render_ready?.explanation || '',
      },
      correct_answer: concept.realQuestion.questionData.correct_answer || 1,
    } : null),
    conceptHighlightV2: concept.realQuestion?.conceptHighlightV2 || null,
    relatedQuestions: bestQ ? [{
      id: bestQ.id,
      questionSource: bestQ.sourceExam,
      questionNumber: bestQ.questionNumber,
      correct_answer: bestQ.correctAnswer,
      rawStimulus: bestQ.stimulus || '',
      conceptHighlightV2: null,
      question: {
        metadata: { source_exam: bestQ.sourceExam, question_number: bestQ.questionNumber },
        render_ready: {
          question_stem: bestQ.stem || '',
          stimulus_data: bestQ.stimulus ? { content: bestQ.stimulus } : null,
          options_list: bestQ.options || [],
          explanation: bestQ.explanation || '',
        },
      },
    }] : [],
    _subtopics: analysis.subtopics || [],
    _bestQuestionReason: analysis.bestQuestionReason || '',
    _conceptUsage: content?.conceptUsage || '',
    _caution: analysis.caution || '',
    _generatedByModel: content ? MODEL_GENERATE : 'none',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DB 저장
// ═══════════════════════════════════════════════════════════════════════════════
async function saveToSupabase(concept: any, output: any) {
  if (!supabase) return;
  const meta = SUBJECT_MAP[concept._subjectSlug || 'success'];
  if (!meta) return;

  const { data: unit } = await supabase!
    .from('textbook_units')
    .select('id')
    .eq('subject', meta.dbSubject)
    .eq('unit_number', concept._unitNumber)
    .single();

  if (!unit) return;

  const { data: current } = await supabase!
    .from('textbook_concept_cards')
    .select('real_question')
    .eq('unit_id', unit.id)
    .eq('name', concept.name)
    .single();

  const currentRealQuestion = (current?.real_question as Record<string, unknown>) || {};
  const updatedRealQuestion = {
    ...currentRealQuestion,
    // 기존 real_question 구조는 유지하고, 새 프론트 응답용 메타데이터만 추가한다.
    conceptUsage: output._conceptUsage || currentRealQuestion.conceptUsage || '',
    conceptSubtopics: output._subtopics || [],
    conceptExamPatterns: output.examTips || [],
    conceptContent: output.conceptContent || '',
  };

  const { error } = await supabase!
    .from('textbook_concept_cards')
    .update({
      enriched_definition: output.description,
      key_points: output.keyPoints,
      caution: output?._caution || '',
      real_question: updatedRealQuestion,
    })
    .eq('unit_id', unit.id)
    .eq('name', concept.name);

  if (error) console.error(`  ❌ DB 저장 실패 [${concept.name}]: ${error.message}`);
  else console.log(`  💾 DB 저장 완료: ${concept.name}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 메인
// ═══════════════════════════════════════════════════════════════════════════════
function parseArgs() {
  const args: any = { dryRun: false, generate: false };
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--subject' && process.argv[i + 1]) args.subject = process.argv[++i];
    else if (process.argv[i] === '--unit' && process.argv[i + 1]) args.unit = parseInt(process.argv[++i], 10);
    else if (process.argv[i] === '--dry-run') args.dryRun = true;
    else if (process.argv[i] === '--generate') args.generate = true;
  }
  return args;
}

async function main() {
  const args = parseArgs();
  if (!args.subject) { console.error('❌ --subject 필요'); process.exit(1); }

  console.log(`📋 기존 대표 태그 보강: ${args.subject}`);
  console.log(`   분석: ${MODEL_ANALYZE}, 생성: ${MODEL_GENERATE}`);
  console.log(`   Generate: ${args.generate ? 'ON' : 'OFF (분석만)'}\n`);

  const concepts = loadConceptCards(args.subject, args.unit);
  console.log(`📦 기존 대표 태그: ${concepts.length}개\n`);

  let totalAnalyzeP = 0, totalAnalyzeC = 0, totalGenP = 0, totalGenC = 0;
  const results: any[] = [];

  for (let i = 0; i < concepts.length; i++) {
    const c = concepts[i];
    console.log(`🔍 [${i + 1}/${concepts.length}] ${c._unitNumber}단원 — ${c.name}`);

    const analysis = await analyzeConcept(c, c._unitNumber, args.subject);
    if (!analysis) {
      console.log(`  ⚠️  분석 실패 — 스킵`);
      continue;
    }

    totalAnalyzeP += analysis.usage.prompt_tokens;
    totalAnalyzeC += analysis.usage.completion_tokens;

    // dry-run: 분석 결과만 출력
    if (!args.generate) {
      console.log(`  📌 세부 개념: ${analysis.subtopics.map((s: any) => s.name).join(', ') || '(없음)'}`);
      console.log(`  🎯 대표 문제: ${analysis.bestQuestion?.sourceExam || '없음'} ${analysis.bestQuestion?.questionNumber || ''}번`);
      console.log(`     이유: ${analysis.bestQuestionReason}`);
      if (analysis.examPatterns.length > 0) console.log(`  📝 출제 패턴: ${analysis.examPatterns.join(' | ')}`);
      console.log();

      results.push({
        name: c.name,
        unitNumber: c._unitNumber,
        rank: c.rank,
        frequency: c.frequency,
        subtopics: analysis.subtopics,
        bestQuestion: analysis.bestQuestion ? {
          source: analysis.bestQuestion.sourceExam,
          number: analysis.bestQuestion.questionNumber,
        } : null,
        bestQuestionReason: analysis.bestQuestionReason,
        examPatterns: analysis.examPatterns,
        caution: analysis.caution,
      });
      continue;
    }

    // 콘텐츠 생성
    console.log(`  📝 콘텐츠 생성 중...`);
    const content = await generateContent(c, analysis);
    if (!content) {
      console.log(`  ⚠️  생성 실패 — 스킵`);
      continue;
    }

    totalGenP += content.usage.prompt_tokens;
    totalGenC += content.usage.completion_tokens;
    c._subjectSlug = args.subject;

    const output = buildOutputCard(c, analysis, content);
    results.push(output);

    // DB 저장
    await saveToSupabase(c, output);

    console.log(`  ✅ 완료: ${output.keyPoints?.length || 0}개 포인트, ${output.examTips?.length || 0}개 출제팁`);
    console.log();
  }

  // 저장
  const outDir = path.join(TEXTBOOK_BASE, '_v2', 'rebuild', args.subject);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = args.generate ? 'concept-tags-enriched.json' : 'concept-tags-analysis.json';
  fs.writeFileSync(path.join(outDir, outFile), JSON.stringify(results, null, 2));

  const analyzeCost = (totalAnalyzeP / 1e6) * 0.15 + (totalAnalyzeC / 1e6) * 0.60;
  const genCost = (totalGenP / 1e6) * 0.15 + (totalGenC / 1e6) * 0.60;
  console.log(`\n📊 분석: ${totalAnalyzeP}/${totalAnalyzeC}t ($${analyzeCost.toFixed(4)})`);
  if (args.generate) console.log(`📊 생성: ${totalGenP}/${totalGenC}t ($${genCost.toFixed(4)})`);
  console.log(`💰 합계: $${(analyzeCost + genCost).toFixed(4)}`);
  console.log(`💾 저장: ${path.join(outDir, outFile)}`);
}

main().catch(console.error);
