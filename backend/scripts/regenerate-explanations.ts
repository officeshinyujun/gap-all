import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ============================================================
// 설정
// ============================================================
const API_KEYS = [
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_API_KEY2,
  process.env.OPENAI_API_KEY3,
].filter((k): k is string => typeof k === 'string' && k.length > 0);

if (API_KEYS.length === 0) {
  console.error('API keys are missing in .env');
  process.exit(1);
}

const clients = API_KEYS.map((key) => new OpenAI({ apiKey: key }));
let clientIndex = 0;
function getNextClient(): OpenAI {
  const client = clients[clientIndex % clients.length];
  clientIndex++;
  return client;
}

const TEXTBOOK_BASE = path.resolve(__dirname, '..', '..', 'textbook');
const PROMPT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'prompts',
  'question_explanation.txt',
);
const MODEL = 'gpt-4o';
const CONCURRENCY = 2; // 낮은 동시성 (해설은 긴 응답이므로)

// Supabase 클라이언트 (선택적)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

const systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');

// 과목 slug → 폴더명 + DB subject 매핑
const SUBJECT_CONFIG: Record<
  string,
  { folder: string; dbSubject: string }
> = {
  success: { folder: 'success_cards_moi', dbSubject: 'sungjik' },
  industry: { folder: 'kongil_cards_moi', dbSubject: 'kongil' },
};

// ============================================================
// 타입
// ============================================================
interface Task {
  filePath: string;
  conceptIdx: number;
  concept: any;
  realQ: any;
  correctAnswer: number;
  stem: string;
  stimulus: string;
  options: string[];
  comboItems: string[];
}

// ============================================================
// 유틸
// ============================================================
function parseCorrectAnswer(value: unknown): number {
  if (typeof value === 'number') {
    if (value === 0) return 1; // 0-based → 1-based
    return value;
  }
  if (typeof value === 'string') {
    const map: Record<string, number> = {
      '①': 1,
      '②': 2,
      '③': 3,
      '④': 4,
      '⑤': 5,
    };
    if (map[value]) return map[value];
    const num = parseInt(value.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num >= 1 && num <= 5) return num;
  }
  return 1;
}

function extractText(response: string): string {
  // 코드블록 제거
  const codeBlock = response.match(/```(?:[\s\S]*?)```/);
  if (codeBlock) {
    return codeBlock[0].replace(/```(?:\w+)?\s*/, '').replace(/\s*```$/, '').trim();
  }
  // JSON 이스케이프된 경우 처리
  try {
    const parsed = JSON.parse(response);
    if (typeof parsed === 'string') return parsed;
    if (parsed.explanation) return parsed.explanation;
  } catch {}
  return response.trim();
}

// ============================================================
// OpenAI 호출 — 해설 생성
// ============================================================
async function generateExplanation(task: Task): Promise<string | null> {
  const client = getNextClient();

  const userContent = JSON.stringify({
    stem: task.stem,
    stimulus: task.stimulus,
    options: task.options.map((opt, i) => `${i + 1}. ${opt}`),
    correct_answer: task.correctAnswer,
    combo_items: task.comboItems,
  });

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.5,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content ?? '';
    const explanation = extractText(content);

    if (!explanation || explanation.trim().length < 30) {
      console.warn(
        `  ⚠️  [${task.concept.name}] 해설이 너무 짧음 (${explanation?.length ?? 0}자)`,
      );
      return null;
    }

    // 정답 번호 문구 체크
    const expectedAnswerPhrase = `정답은 ${task.correctAnswer}번`;
    if (!explanation.includes(expectedAnswerPhrase)) {
      console.warn(
        `  ⚠️  [${task.concept.name}] 해설에 정답 번호(${task.correctAnswer}) 언급 없음 — 그래도 저장`,
      );
    }

    console.log(
      `  ✓  [${task.concept.name}] 해설 생성 완료 (${explanation.length}자)`,
    );
    return explanation;
  } catch (e) {
    console.error(
      `  ✗  [${task.concept.name}] API 오류: ${(e as Error).message}`,
    );
    return null;
  }
}

// ============================================================
// 배치 처리
// ============================================================
async function processBatch(
  tasks: Task[],
): Promise<Map<string, { idx: number; explanation: string }[]>> {
  const results = new Map<
    string,
    { idx: number; explanation: string }[]
  >();

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (task) => {
      console.log(
        `\n  🔄 [${task.concept.name}] 해설 생성 중...`,
      );
      const explanation = await generateExplanation(task);
      if (explanation) {
        return { task, explanation };
      }
      return null;
    });

    const batchResults = await Promise.all(promises);
    for (const result of batchResults) {
      if (!result) continue;
      const { task, explanation } = result;
      if (!results.has(task.filePath)) results.set(task.filePath, []);
      results.get(task.filePath)!.push({ idx: task.conceptIdx, explanation });
    }

    // API rate limit 방지
    if (i + CONCURRENCY < tasks.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

// ============================================================
// Supabase 직접 업데이트
// ============================================================
async function updateSupabaseDirectly(
  subjectSlug: string,
  unitNumber: number,
  conceptName: string,
  explanation: string,
): Promise<boolean> {
  if (!supabase) return false;

  try {
    const subject = SUBJECT_CONFIG[subjectSlug]?.dbSubject;
    if (!subject) return false;

    // unit_id 조회
    const { data: unit } = await supabase
      .from('textbook_units')
      .select('id')
      .eq('subject', subject)
      .eq('unit_number', unitNumber)
      .single();

    if (!unit) return false;

    // 해당 concept card 조회
    const { data: cards } = await supabase
      .from('textbook_concept_cards')
      .select('id, real_question')
      .eq('unit_id', unit.id)
      .eq('name', conceptName)
      .limit(1);

    if (!cards || cards.length === 0) return false;

    // real_question.questionData.render_ready.explanation 업데이트
    const existingRQ = cards[0].real_question || {};
    const existingQD = existingRQ.questionData || {};
    const existingRR = existingQD.render_ready || {};

    const updatedRQ = {
      ...existingRQ,
      questionData: {
        ...existingQD,
        render_ready: {
          ...existingRR,
          explanation,
        },
      },
    };

    const { error } = await supabase
      .from('textbook_concept_cards')
      .update({ real_question: updatedRQ })
      .eq('id', cards[0].id);

    if (error) {
      console.error(`    ✗ Supabase 업데이트 실패: ${error.message}`);
      return false;
    }

    console.log(`    💾 Supabase 저장 완료: ${conceptName}`);
    return true;
  } catch (e) {
    console.error(
      `    ✗ Supabase 업데이트 오류: ${(e as Error).message}`,
    );
    return false;
  }
}

// ============================================================
// CLI 인자 파싱
// ============================================================
function parseArgs(): {
  subjects: string[];
  force: boolean;
  unitFilter: number[] | null;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    subjects: Object.keys(SUBJECT_CONFIG),
    force: false,
    unitFilter: null as number[] | null,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--force':
        result.force = true;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--subject':
        if (args[i + 1] && SUBJECT_CONFIG[args[i + 1]]) {
          result.subjects = [args[i + 1]];
          i++;
        } else {
          console.error(
            `유효하지 않은 과목: ${args[i + 1]}. 사용 가능: ${Object.keys(SUBJECT_CONFIG).join(', ')}`,
          );
          process.exit(1);
        }
        break;
      case '--units':
        if (args[i + 1]) {
          result.unitFilter = args[i + 1]
            .split(',')
            .map(Number)
            .filter((n) => !isNaN(n));
          i++;
        }
        break;
      case '--help':
        console.log(`
사용법: npx ts-node regenerate-explanations.ts [옵션]

옵션:
  --force          이미 explanation이 있어도 강제 재생성
  --subject <slug> 특정 과목만 처리 (success | industry)
  --units <nums>   특정 단원만 처리 (쉼표 구분, 예: --units 2,4,9)
  --dry-run        실제 생성 없이 대상만 출력

기본값: 모든 과목, explanation이 없는 개념만 처리
        `);
        process.exit(0);
    }
  }

  return result;
}

// ============================================================
// 메인
// ============================================================
async function main() {
  const args = parseArgs();

  console.log('📋 설정:');
  console.log(`   과목: ${args.subjects.join(', ')}`);
  console.log(`   Force: ${args.force}`);
  console.log(`   단원 필터: ${args.unitFilter?.join(', ') ?? '전체'}`);
  console.log(`   Dry run: ${args.dryRun}`);
  console.log(
    `   Supabase: ${supabase ? '연결됨' : '미연결 (JSON 파일만 저장)'}`,
  );
  console.log(`   병렬: ${CONCURRENCY}, API키: ${API_KEYS.length}개\n`);

  const allTasks: Task[] = [];

  for (const subjectSlug of args.subjects) {
    const config = SUBJECT_CONFIG[subjectSlug];
    if (!config) continue;

    const dirPath = path.join(TEXTBOOK_BASE, config.folder);
    if (!fs.existsSync(dirPath)) {
      console.warn(`  ⚠️  ${config.folder} 디렉토리가 없습니다.`);
      continue;
    }

    const files = fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
      .filter((f) => {
        if (!args.unitFilter) return true;
        const unitMatch = f.match(/^(\d+)단원\.json$/);
        return unitMatch && args.unitFilter.includes(parseInt(unitMatch[1], 10));
      });

    console.log(`\n📂 ${config.folder}/ — ${files.length}개 파일`);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      let data: any;
      try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        console.warn(`  ⚠️  ${file} 파싱 실패`);
        continue;
      }

      if (!data.concepts) continue;

      const unitMatch = file.match(/^(\d+)단원\.json$/);
      const unitNumber = unitMatch ? parseInt(unitMatch[1], 10) : 0;

      for (let i = 0; i < data.concepts.length; i++) {
        const concept = data.concepts[i];
        const realQ = concept.realQuestion?.questionData;

        if (!realQ) {
          if (args.dryRun) {
            console.log(
              `  [SKIP] ${concept.name} — questionData 없음`,
            );
          }
          continue;
        }

        // 이미 explanation이 있고 force 모드가 아니면 스킵
        const existingExp = realQ.render_ready?.explanation;
        const hasExp =
          existingExp &&
          typeof existingExp === 'string' &&
          existingExp.trim().length > 20;
        if (hasExp && !args.force) {
          continue;
        }

        // 데이터 추출
        const stem =
          realQ.render_ready?.question_stem || realQ.stem || '';
        const stimulus =
          typeof realQ.render_ready?.stimulus_data === 'object'
            ? JSON.stringify(realQ.render_ready.stimulus_data)
            : realQ.stimulus || '';
        const options =
          realQ.render_ready?.options_list || realQ.options || [];
        const correctAnswer = parseCorrectAnswer(
          realQ.correct_answer ?? realQ.answer,
        );
        const comboItems = realQ.box_items || [];

        if (!stem || options.length === 0) {
          if (args.dryRun) {
            console.log(
              `  [SKIP] ${concept.name} — stem 또는 options 없음`,
            );
          }
          continue;
        }

        allTasks.push({
          filePath,
          conceptIdx: i,
          concept,
          realQ,
          correctAnswer,
          stem,
          stimulus,
          options,
          comboItems,
        });
      }
    }
  }

  if (args.dryRun) {
    console.log(`\n📊 Dry run 결과:`);
    console.log(`   해설 생성 대상: ${allTasks.length}개`);
    console.log(
      `   └─ explanation 없음: ${allTasks.filter((t) => !t.realQ.render_ready?.explanation || (typeof t.realQ.render_ready.explanation === 'string' && t.realQ.render_ready.explanation.trim().length <= 20)).length}개`,
    );
    console.log(
      `   └─ force 재생성: ${allTasks.filter((t) => t.realQ.render_ready?.explanation && typeof t.realQ.render_ready.explanation === 'string' && t.realQ.render_ready.explanation.trim().length > 20).length}개`,
    );
    return;
  }

  console.log(`\n🎯 총 ${allTasks.length}개 개념에 해설 생성 예정\n`);

  if (allTasks.length === 0) {
    console.log('처리할 항목 없음.');
    console.log(
      '(--force 플래그를 사용하면 기존 해설도 재생성합니다)',
    );
    return;
  }

  // 확인
  console.log('계속하려면 5초 내에 Ctrl+C를 누르세요...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const results = await processBatch(allTasks);

  // 결과 저장
  let savedCount = 0;
  let supabaseSavedCount = 0;

  const resultEntries = Array.from(results.entries());
  for (const [filePath, explanations] of resultEntries) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    for (const { idx, explanation } of explanations) {
      const concept = data.concepts[idx];

      // JSON 파일 저장 — render_ready.explanation 업데이트
      if (!data.concepts[idx].realQuestion) {
        data.concepts[idx].realQuestion = {};
      }
      if (!data.concepts[idx].realQuestion.questionData) {
        data.concepts[idx].realQuestion.questionData = {};
      }
      if (!data.concepts[idx].realQuestion.questionData.render_ready) {
        data.concepts[idx].realQuestion.questionData.render_ready = {};
      }
      data.concepts[idx].realQuestion.questionData.render_ready.explanation =
        explanation;
      savedCount++;

      // Supabase 직접 저장
      const unitMatch = path
        .basename(filePath)
        .match(/^(\d+)단원\.json$/);
      const unitNumber = unitMatch ? parseInt(unitMatch[1], 10) : 0;
      const subjectSlug = filePath.includes('success_cards_moi')
        ? 'success'
        : 'industry';

      if (supabase) {
        const supabaseOk = await updateSupabaseDirectly(
          subjectSlug,
          unitNumber,
          concept.name,
          explanation,
        );
        if (supabaseOk) supabaseSavedCount++;
      }
    }

    fs.writeFileSync(
      filePath,
      JSON.stringify(data, null, 2),
      'utf-8',
    );
    console.log(
      `💾 ${path.basename(filePath)} 저장 (${explanations.length}개 해설 추가)`,
    );
  }

  // 실패한 항목에 대해 경고
  const failedCount = allTasks.length - savedCount;
  if (failedCount > 0) {
    console.log(`\n⚠️  ${failedCount}개 개념은 해설 생성에 실패했습니다.`);
    console.log(
      '   (네트워크 오류나 API 할당량 초과일 수 있습니다. 다시 실행해보세요.)',
    );
  }

  console.log(`\n========================================`);
  console.log(`📊 최종 결과:`);
  console.log(`   JSON 파일 저장: ${savedCount}/${allTasks.length}`);
  if (supabase) {
    console.log(`   Supabase 저장: ${supabaseSavedCount}/${allTasks.length}`);
  }
  console.log(`   실패: ${failedCount}건`);
}

main().catch(console.error);
