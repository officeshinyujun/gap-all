/**
 * normalize-textbook.ts
 *
 * Phase 1-2: 수능특강 원문 + 실제 문제를 정규화하여
 * 과목별·단원별로 정리된 JSON 파일로 출력합니다.
 *
 * 입력:
 *   textbook/parsed/{sungjik,kongil}/suteck/*.json
 *   textbook/parsed/{sungjik,kongil}/moi/*.json
 *   textbook/sungjik_structured/*.json
 *   textbook/kongil_structured/*.json
 *   textbook/success_cards_moi/*.json
 *   textbook/kongil_cards_moi/*.json
 *
 * 출력:
 *   textbook/_v2/normalized/{subject}/units.json
 *   textbook/_v2/normalized/{subject}/questions.json
 *
 * 사용법:
 *   npx ts-node --project tsconfig.json scripts/normalize-textbook.ts
 *     --subject success
 *     --dry-run
 */

import * as fs from 'fs';
import * as path from 'path';

interface TextbookSection {
  id: string;
  subject: string;
  subjectKor: string;
  unitNumber: number;
  order: number;
  title: string;
  text: string;
  sourceFile: string;
}

interface NormalizedUnit {
  subject: string;
  subjectKor: string;
  unitNumber: number;
  sections: TextbookSection[];
  structuredSections: StructuredConceptSection[];
  existingConceptNames: string[];
}

interface NormalizedQuestion {
  id: string;
  subject: string;
  sourceExam: string;
  questionNumber: number;
  unitNumber: number | null;
  stem: string;
  stimulus: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  sourceFile: string;
}

interface StructuredConceptSection {
  title: string;
  summary: string;
  subsections: StructuredSubsection[];
  order: number;
}

interface StructuredSubsection {
  title: string;
  explanation: string;
  keyPoints: string[];
  table: string;
  visualGuide: string;
  examPoints: string[];
  pitfalls: string[];
  supplementNote: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 설정
// ═══════════════════════════════════════════════════════════════════════════════
const TEXTBOOK_BASE = path.resolve(__dirname, '..', '..', 'textbook');
const OUTPUT_BASE = path.resolve(TEXTBOOK_BASE, '_v2', 'normalized');

const SUBJECT_MAP: Record<string, { folder: string; kor: string }> = {
  success: { folder: 'sungjik', kor: '성공적인 직업생활' },
  industry: { folder: 'kongil', kor: '공업 일반' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 1: 수능특강 원문 → TextbookSection[]
// ═══════════════════════════════════════════════════════════════════════════════
function parseSuteckQuestions(subjectSlug: string): NormalizedUnit[] {
  const meta = SUBJECT_MAP[subjectSlug];
  if (!meta) throw new Error(`Unknown subject: ${subjectSlug}`);

  const suteckDir = path.join(TEXTBOOK_BASE, 'parsed', meta.folder, 'suteck');
  if (!fs.existsSync(suteckDir)) return [];

  const files = fs.readdirSync(suteckDir).filter(f => f.endsWith('.json'));
  const units: NormalizedUnit[] = [];

  for (const file of files) {
    const unitMatch = file.match(/(\d+)단원/);
    if (!unitMatch) continue;
    const unitNumber = parseInt(unitMatch[1], 10);

    const data = JSON.parse(fs.readFileSync(path.join(suteckDir, file), 'utf-8'));
    const questions = Array.isArray(data) ? data : data.questions || [];

    // 교재 문제에서 섹션 추출: 각 문제를 하나의 section으로 취급
    const sections: TextbookSection[] = questions.map((q: any, idx: number) => ({
      id: `${meta.folder}:suteck:unit-${String(unitNumber).padStart(2, '0')}:q${q.questionNumber || idx + 1}`,
      subject: meta.folder,
      subjectKor: meta.kor,
      unitNumber,
      order: idx,
      title: q.stem?.split('\n')[0]?.slice(0, 80) || `문제 ${q.questionNumber || idx + 1}`,
      text: [
        `[발문] ${q.stem || ''}`,
        `[자료] ${q.stimulus || ''}`,
        `[선택지] ${(q.options || []).join(' | ')}`,
        `[정답] ${q.correctAnswer || ''}`,
        `[해설] ${q.explanation || ''}`,
      ].join('\n'),
      sourceFile: `suteck/${file}`,
    }));

    // 중복 제거: 동일 단원은 하나의 unit으로
    const existing = units.find(u => u.unitNumber === unitNumber);
    if (existing) {
      existing.sections.push(...sections);
    } else {
      units.push({
        subject: meta.folder,
        subjectKor: meta.kor,
        unitNumber,
        sections,
        structuredSections: [],
        existingConceptNames: [],
      });
    }
  }

  return units;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 2: 구조화 개념 로드
// ═══════════════════════════════════════════════════════════════════════════════
function loadStructuredConcepts(subjectSlug: string): Map<number, StructuredConceptSection[]> {
  const meta = SUBJECT_MAP[subjectSlug];
  if (!meta) return new Map();

  const structDir = path.join(TEXTBOOK_BASE, `${meta.folder}_structured`);
  if (!fs.existsSync(structDir)) return new Map();

  const map = new Map<number, StructuredConceptSection[]>();

  for (const file of fs.readdirSync(structDir)) {
    const unitMatch = file.match(/(\d+)단원/);
    if (!unitMatch) continue;
    const unitNumber = parseInt(unitMatch[1], 10);

    try {
      const data = JSON.parse(fs.readFileSync(path.join(structDir, file), 'utf-8'));
      const sections: StructuredConceptSection[] = (data.sections || []).map(
        (s: any, idx: number) => ({
          title: s.title || '',
          summary: s.summary || '',
          subsections: (s.subsections || []).map((sub: any) => ({
            title: sub.title || '',
            explanation: sub.explanation || '',
            keyPoints: sub.keyPoints || [],
            table: sub.table || '',
            visualGuide: sub.visualGuide || '',
            examPoints: sub.examPoints || [],
            pitfalls: sub.pitfalls || [],
            supplementNote: sub.supplementNote || '',
          })),
          order: idx,
        }),
      );
      map.set(unitNumber, sections);
    } catch (err) {
      console.warn(`  ⚠️ ${file} 파싱 실패: ${(err as Error).message}`);
    }
  }

  return map;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3: 기존 개념 카드 이름 수집
// ═══════════════════════════════════════════════════════════════════════════════
function loadExistingConceptNames(subjectSlug: string): Map<number, string[]> {
  const meta = SUBJECT_MAP[subjectSlug];
  if (!meta) return new Map();

  // 시도할 디렉토리 순서
  const candidates = [
    path.join(TEXTBOOK_BASE, `${subjectSlug}_cards_moi`),
    path.join(TEXTBOOK_BASE, `${meta.folder}_cards_moi`),
  ];
  let cardDir = '';
  for (const c of candidates) {
    if (fs.existsSync(c)) { cardDir = c; break; }
  }
  if (!cardDir) return new Map();
  if (!fs.existsSync(cardDir)) return new Map();

  const map = new Map<number, string[]>();

  for (const file of fs.readdirSync(cardDir)) {
    const unitMatch = file.match(/(\d+)단원/);
    if (!unitMatch) continue;
    const unitNumber = parseInt(unitMatch[1], 10);

    try {
      const data = JSON.parse(fs.readFileSync(path.join(cardDir, file), 'utf-8'));
      const names = (data.concepts || []).map((c: any) => c.name).filter(Boolean);
      map.set(unitNumber, names);
    } catch { /* skip */ }
  }

  return map;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 4: 실제 문제 정규화
// ═══════════════════════════════════════════════════════════════════════════════
function normalizeExamQuestions(subjectSlug: string): NormalizedQuestion[] {
  const meta = SUBJECT_MAP[subjectSlug];
  if (!meta) return [];

  const moiDir = path.join(TEXTBOOK_BASE, 'parsed', meta.folder, 'moi');
  if (!fs.existsSync(moiDir)) return [];

  const questions: NormalizedQuestion[] = [];

  for (const file of fs.readdirSync(moiDir)) {
    if (!file.endsWith('.json')) continue;

    try {
      const data = JSON.parse(fs.readFileSync(path.join(moiDir, file), 'utf-8'));
      const items = Array.isArray(data) ? data : data.questions || [];

      for (const q of items) {
        const sourceExam = q.source?.examType
          ? `${q.source.year}년 ${q.source.examType}`
          : path.basename(file, '.json').replace(/_/g, ' ');

        questions.push({
          id: `${meta.folder}:moi:${sourceExam}:q${q.questionNumber || 0}`,
          subject: meta.folder,
          sourceExam,
          questionNumber: q.questionNumber || 0,
          unitNumber: null, // 나중에 매핑
          stem: q.stem || '',
          stimulus: q.stimulus || '',
          options: q.options || [],
          correctAnswer: parseAnswer(q.correctAnswer),
          explanation: q.explanation || '',
          sourceFile: file,
        });
      }
    } catch (err) {
      console.warn(`  ⚠️ ${file} 파싱 실패: ${(err as Error).message}`);
    }
  }

  return questions;
}

function parseAnswer(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const map: Record<string, number> = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
    if (map[val]) return map[val];
    const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num >= 1 && num <= 5) return num;
  }
  return 1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 메인
// ═══════════════════════════════════════════════════════════════════════════════
function parseArgs() {
  const args: { subject?: string; dryRun: boolean } = { dryRun: false };
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--subject' && process.argv[i + 1]) args.subject = process.argv[++i];
    else if (process.argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

function main() {
  const args = parseArgs();
  const subjects = args.subject ? [args.subject] : Object.keys(SUBJECT_MAP);

  console.log('📋 개념 카탈로그 재구성 — Phase 1-2: 데이터 정규화\n');

  for (const subjectSlug of subjects) {
    const meta = SUBJECT_MAP[subjectSlug];
    if (!meta) continue;

    console.log(`📂 ${subjectSlug} (${meta.kor})`);

    // 수능특강 → TextbookSection
    const suteckUnits = parseSuteckQuestions(subjectSlug);
    // 구조화 개념
    const structured = loadStructuredConcepts(subjectSlug);
    // 기존 개념 이름
    const existingNames = loadExistingConceptNames(subjectSlug);
    // 실제 문제
    const questions = normalizeExamQuestions(subjectSlug);

    // 합치기
    for (const unit of suteckUnits) {
      unit.structuredSections = structured.get(unit.unitNumber) || [];
      unit.existingConceptNames = existingNames.get(unit.unitNumber) || [];
    }

    console.log(`   단원: ${suteckUnits.length}개`);
    const totalSections = suteckUnits.reduce((sum, u) => sum + u.sections.length, 0);
    console.log(`   교재 섹션: ${totalSections}개`);
    const structuredCount = suteckUnits.reduce(
      (sum, u) => sum + u.structuredSections.reduce((s, sec) => s + sec.subsections.length, 0),
      0,
    );
    console.log(`   구조화 서브섹션: ${structuredCount}개`);
    const conceptNameCount = suteckUnits.reduce((sum, u) => sum + u.existingConceptNames.length, 0);
    console.log(`   기존 개념명: ${conceptNameCount}개`);
    console.log(`   실제 문제: ${questions.length}개`);

    // RIASEC/홀랜드 포함 여부 확인
    let hasRiaSec = false;
    for (const u of suteckUnits) {
      for (const s of u.structuredSections) {
        for (const sub of s.subsections) {
          const text = [sub.title, sub.explanation, ...sub.keyPoints, sub.visualGuide, ...sub.examPoints].join(' ');
          if (text.includes('홀랜드') || text.includes('RIASEC')) {
            hasRiaSec = true;
            console.log(`   ✅ 홀랜드/RIASEC 발견: ${u.unitNumber}단원 > ${s.title} > ${sub.title}`);
          }
        }
      }
    }
    if (!hasRiaSec) console.log(`   ⚠️  홀랜드/RIASEC 데이터 없음`);

    // 저장
    if (!args.dryRun) {
      const outDir = path.join(OUTPUT_BASE, subjectSlug);
      fs.mkdirSync(outDir, { recursive: true });

      fs.writeFileSync(
        path.join(outDir, 'units.json'),
        JSON.stringify(suteckUnits, null, 2),
      );
      fs.writeFileSync(
        path.join(outDir, 'questions.json'),
        JSON.stringify(questions, null, 2),
      );

      // inventory report
      const report = {
        subject: subjectSlug,
        subjectKor: meta.kor,
        units: suteckUnits.length,
        totalSections: totalSections,
        structuredSubsections: structuredCount,
        existingConceptNames: conceptNameCount,
        totalQuestions: questions.length,
        hasRiaSec,
      };
      fs.writeFileSync(
        path.join(outDir, 'inventory.json'),
        JSON.stringify(report, null, 2),
      );

      console.log(`   💾 ${outDir}/ 저장 완료\n`);
    }
  }

  console.log('✅ 완료');
}

main();
