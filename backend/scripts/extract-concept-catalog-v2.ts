/**
 * extract-concept-catalog-v2.ts
 *
 * Phase 3: 정규화된 교재 원문에서 OpenAI로 전체 개념 후보를 추출합니다.
 *
 * 입력:  textbook/_v2/normalized/{subject}/units.json
 * 출력:  textbook/_v2/normalized/{subject}/concept-candidates.json
 *
 * 사용법:
 *   npx ts-node --project tsconfig.json scripts/extract-concept-catalog-v2.ts
 *     --subject success
 *     --unit 1              (선택: 단원 필터)
 *     --limit 2             (선택: 최대 단원 수)
 *     --dry-run             (별도 실행 없이 대상만 출력)
 *
 * 컨셉:
 *   "가장 빠르고 가볍게 개념 목록만 먼저 뽑는다"
 *   이후 link-and-generate-v2.ts에서 실제 콘텐츠를 생성한다.
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

const MODEL = process.env.OPENAI_EXTRACT_MODEL ?? 'gpt-4o-mini';
const TEXTBOOK_BASE = path.resolve(__dirname, '..', '..', 'textbook');
const MAX_RETRIES = 3;

// ── Types ─────────────────────────────────────────────────────────────────────
interface ExtractedConcept {
  canonicalName: string;
  aliases: string[];
  isPrimary: boolean;
  evidence: { sectionId?: string; quote: string }[];
  subtopics: string[];
}

interface UnitConcepts {
  subject: string;
  unitNumber: number;
  concepts: ExtractedConcept[];
  existingGap: string[]; // 교재에는 있지만 기존 concept_cards에는 없는 개념명
  model: string;
  usage: { prompt_tokens?: number; completion_tokens?: number };
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function extractJson(text: string): any {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = codeBlock ? codeBlock[1].trim() : text.trim();
  return JSON.parse(raw);
}

function buildExtractionPrompt(unit: any): string {
  const nameList = unit.existingConceptNames || [];
  const structText = (unit.structuredSections || []).map((s: any) => {
    const subs = (s.subsections || []).map((sub: any) => {
      return [
        `### ${sub.title}`,
        sub.explanation || '',
        `핵심 포인트: ${(sub.keyPoints || []).join(' | ')}`,
        `시험 포인트: ${(sub.examPoints || []).join(' | ')}`,
        sub.visualGuide || '',
      ].filter(Boolean).join('\n');
    }).join('\n\n');
    return `## ${s.title}\n${subs}`;
  }).join('\n\n');

  const textSections = (unit.sections || []).slice(0, 15).map((sec: any) =>
    sec.text?.slice(0, 800) || ''
  ).join('\n---\n');

  return `# Role: 교과서 개념 추출 전문가
# Context: 수능특강 교재의 한 단원 원문과 구조화된 개념 데이터를 보고, 이 단원에서 가르치는 **모든 개념**을 빠짐없이 추출하라.

# [Input]
- 단원: ${unit.subjectKor} ${unit.unitNumber}단원
- 기존에 DB에 저장된 개념명(참고용): ${nameList.join(', ') || '(없음)'}

# [구조화 개념 데이터]
${structText.slice(0, 4000) || '(없음)'}

# [교재 원문 일부]
${textSections.slice(0, 3000)}

# [요구사항]
1. **추출 기준**:
   - 교과서에서 별도로 정의·설명되는 개념
   - 분류 체계, 모형, 이론
   - 표/도식의 핵심 주제
   - 여러 문단에서 반복되는 핵심 키워드
   - 시험 문제에서 직접 묻는 개념

2. **출력 JSON 스키마**:
{
  "concepts": [
    {
      "canonicalName": "개념의 정식 명칭",
      "aliases": ["별칭1", "약어"],
      "isPrimary": true,
      "evidence": [{"sectionId": "참조ID", "quote": "원문 인용구"}],
      "subtopics": ["하위 주제1"]
    }
  ],
  "missingFromExisting": ["교재에 있지만 기존 DB에 없는 개념명"]
}

3. **규칙**:
   - 구조화 개념 데이터에 등장하는 모든 제목·주제는 반드시 포함
   - isPrimary=true는 단원의 핵심 대주제 (5~12개)
   - isPrimary=false는 보조 개념/하위 분류
   - evidence는 반드시 실제 원문/구조화 데이터의 표현을 인용
   - 기존 DB에 없는 개념은 missingFromExisting에 별도로 알려줘
   - 정확히 JSON만 출력하고 부연 설명은 하지 마`;
}

// ── OpenAI 호출 ───────────────────────────────────────────────────────────────
async function extractConcepts(unit: any): Promise<UnitConcepts | null> {
  const prompt = buildExtractionPrompt(unit);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const client = getNextClient();
    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: '정확히 JSON만 출력하라. 부연 설명 없이.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      });

      const content = response.choices[0]?.message?.content ?? '';
      const parsed = extractJson(content);
      const concepts: ExtractedConcept[] = (parsed.concepts || []).map((c: any) => ({
        canonicalName: c.canonicalName || c.name || '',
        aliases: c.aliases || [],
        isPrimary: c.isPrimary !== false,
        evidence: (c.evidence || []).map((e: any) => ({
          sectionId: e.sectionId || '',
          quote: e.quote || '',
        })),
        subtopics: c.subtopics || [],
      }));

      if (concepts.length === 0) {
        console.warn(`  ⚠️  시도 ${attempt}: 개념 0개 — 빈 결과`);
        continue;
      }

      return {
        subject: unit.subject,
        unitNumber: unit.unitNumber,
        concepts,
        existingGap: parsed.missingFromExisting || [],
        model: MODEL,
        usage: {
          prompt_tokens: response.usage?.prompt_tokens,
          completion_tokens: response.usage?.completion_tokens,
        },
      };

    } catch (err: any) {
      if (attempt < MAX_RETRIES) {
        console.warn(`  ⚠️  시도 ${attempt} 실패: ${err.message?.slice(0, 100)}`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
      } else {
        console.error(`  ❌ 최대 재시도 초과`);
      }
    }
  }
  return null;
}

// ── 메인 ───────────────────────────────────────────────────────────────────────
function parseArgs() {
  const args: { subject?: string; unit?: number; limit: number; dryRun: boolean } =
    { limit: 0, dryRun: false };
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--subject' && process.argv[i + 1]) args.subject = process.argv[++i];
    else if (process.argv[i] === '--unit' && process.argv[i + 1]) args.unit = parseInt(process.argv[++i], 10);
    else if (process.argv[i] === '--limit' && process.argv[i + 1]) args.limit = parseInt(process.argv[++i], 10);
    else if (process.argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

async function main() {
  const args = parseArgs();
  if (!args.subject) { console.error('❌ --subject 필요'); process.exit(1); }

  const unitFile = path.join(TEXTBOOK_BASE, '_v2', 'normalized', args.subject, 'units.json');
  if (!fs.existsSync(unitFile)) {
    console.error(`❌ ${unitFile} 없음 — normalize-textbook.ts 먼저 실행`);
    process.exit(1);
  }

  const allUnits: any[] = JSON.parse(fs.readFileSync(unitFile, 'utf-8'));
  let targets = allUnits;
  if (args.unit) targets = targets.filter(u => u.unitNumber === args.unit);
  if (args.limit > 0) targets = targets.slice(0, args.limit);

  console.log(`📋 개념 추출: ${args.subject}, ${targets.length}단원, 모델=${MODEL}\n`);

  if (args.dryRun) {
    for (const u of targets) {
      console.log(`  ${u.unitNumber}단원: ${u.structuredSections.length}개 구조화 섹션, ${u.sections.length}개 교재 섹션, 기존 개념 ${u.existingConceptNames.length}개`);
    }
    return;
  }

  const results: UnitConcepts[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (const unit of targets) {
    console.log(`\n🔍 ${unit.unitNumber}단원 추출 중...`);
    const result = await extractConcepts(unit);
    if (result) {
      results.push(result);
      totalPromptTokens += result.usage.prompt_tokens ?? 0;
      totalCompletionTokens += result.usage.completion_tokens ?? 0;

      console.log(`  ✅ ${result.concepts.length}개 개념 (primary: ${result.concepts.filter(c => c.isPrimary).length}개)`);
      if (result.existingGap.length > 0) {
        console.log(`  📌 기존 DB 누락: ${result.existingGap.join(', ')}`);
      }
      for (const c of result.concepts.slice(0, 5)) {
        console.log(`    - ${c.canonicalName}${c.aliases.length ? ' (' + c.aliases.join(', ') + ')' : ''}`);
      }
      if (result.concepts.length > 5) console.log(`    ... 외 ${result.concepts.length - 5}개`);
    }
  }

  // 저장
  const outPath = path.join(TEXTBOOK_BASE, '_v2', 'normalized', args.subject, 'concept-candidates.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  const inputCost = (totalPromptTokens / 1_000_000) * 0.15;
  const outputCost = (totalCompletionTokens / 1_000_000) * 0.60;
  console.log(`\n📊 비용: input ${totalPromptTokens}t ($${inputCost.toFixed(4)}), output ${totalCompletionTokens}t ($${outputCost.toFixed(4)}), 합계 $${(inputCost + outputCost).toFixed(4)}`);
  console.log(`💾 저장: ${outPath}`);
}

main().catch(console.error);
