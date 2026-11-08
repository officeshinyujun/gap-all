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

let clients: OpenAI[] = [];
let clientIndex = 0;
function getNextClient(): OpenAI {
  if (clients.length === 0) {
    if (API_KEYS.length === 0) throw new Error('API keys are missing in .env');
    clients = API_KEYS.map((key) => new OpenAI({ apiKey: key }));
  }
  const client = clients[clientIndex % clients.length];
  clientIndex++;
  return client;
}

const TEXTBOOK_BASE = path.resolve(__dirname, '..', '..', 'textbook');
const PROMPT_PATH = path.resolve(__dirname, '..', '..', 'prompts', 'concept_highlight_v2.txt');
const MODEL = process.env.OPENAI_CONCEPT_HIGHLIGHT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o';
const CONCURRENCY = 2;
const MAX_RETRIES = 5;
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
};

// Supabase 클라이언트 (선택적)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');

// 과목 slug → 폴더명 + DB subject 매핑
const SUBJECT_CONFIG: Record<string, { folder: string; dbSubject: string }> = {
  success: { folder: 'success_cards_moi', dbSubject: 'sungjik' },
  industry: { folder: 'kongil_cards_moi', dbSubject: 'kongil' },
};

// ============================================================
// 타입
// ============================================================
interface ConceptHighlightV2 {
  stimulusClues: { quote: string; why: string }[];
  optionAnalysis: ({ optionNum: number; verdict: string; reasoning: string } | { optionKey: string; verdict: string; reasoning: string })[];
  solvingFlow: { step: number; action: string }[];
  takeaway: string;
}

interface Task {
  filePath?: string;
  conceptIdx?: number;
  concept: any;
  realQ: any;
  cardId?: string;
  existingRealQuestion?: Record<string, any>;
  subjectSlug?: string;
  unitNumber?: number;
  dbUnitId?: string; // Supabase unit_id (for direct DB update)
}

interface ValidationResult {
  valid: boolean;
  questionType: string;
  expectedO: number | string;
  actualO: number;
  expectedX: number | string;
  actualX: number;
  warnings: string[];
}

// ============================================================
// 검증 — 생성된 optionAnalysis가 문제 유형에 맞는지 확인
// ============================================================
function detectQuestionType(
  stem: string,
  hasComboItems = false,
): 'single_correct' | 'find_wrong' | 'combo' | 'unknown' {
  if (hasComboItems || /<보기>|보기에서|보기의|있는 대로 고른/.test(stem)) {
    return 'combo';
  }
  if (stem.includes('옳지 않은') || stem.includes('적절하지 않은') || stem.includes('적절하지 않는')) {
    return 'find_wrong';
  }
  if (stem.includes('가장 적절') || stem.includes('옳은 것') || stem.includes('적절한 것')) {
    return 'single_correct';
  }
  if (/맞는 것|알맞은 것|해당하는 것|적합한 것|옳은 것은/.test(stem)) {
    return 'single_correct';
  }
  if (/것은[?？]?\s*(?:\[\d+점\])?$/.test(stem) || /짝지은|들어갈 내용|해당하는 내용/.test(stem)) {
    return 'single_correct';
  }
  return 'unknown';
}

function questionOptions(question: any): any[] {
  const candidates = [question?.render_ready?.options_list, question?.options, question?.choices]
    .filter((options): options is any[] => Array.isArray(options) && options.length > 0);
  return candidates.find((options) => options.length === 5) || candidates[0] || [];
}

function questionComboItems(question: any): string[] {
  for (const items of [question?.box_items, question?.render_ready?.box_items]) {
    if (Array.isArray(items) && items.length > 0) return items.map(String);
  }
  const fullText = typeof question?.full_text === 'string' ? question.full_text : '';
  const 보기 = fullText.match(/<보기>([\s\S]*?)(?=\n\s*①|$)/)?.[1] || '';
  return 보기
    .split(/\n+/)
    .map((line: string) => line.trim())
    .filter((line: string) => /^ㄱ\.|^ㄴ\.|^ㄷ\.|^ㄹ\.|^ㅁ\.|^ㅂ\./.test(line));
}

function optionText(option: unknown): string {
  if (typeof option === 'string' || typeof option === 'number') return String(option);
  if (!option || typeof option !== 'object') return '';
  const value = option as Record<string, unknown>;
  return String(value.text ?? value.content ?? value.label ?? value.value ?? '').trim();
}

function comboAnswerKeys(value: unknown, validKeys: string[]): string[] {
  const text = String(value ?? '');
  return [...new Set(text.match(/[ㄱ-ㅎ]/gu) || [])].filter((key) => validKeys.includes(key));
}

function validateQuestion(realQ: any): string[] {
  const stem = String(realQ?.render_ready?.question_stem || realQ?.stem || '').trim();
  const options = questionOptions(realQ);
  const comboItems = questionComboItems(realQ);
  const answerValue = realQ?.correct_answer ?? realQ?.answer;
  const questionType = detectQuestionType(stem, comboItems.length > 0);
  const errors: string[] = [];

  if (!stem) errors.push('question stem missing');
  if (!Array.isArray(options) || options.length !== 5) {
    errors.push('question must have exactly 5 options');
  }
  if (!getPlainStimulus(realQ)) errors.push('stimulus missing');

  if (questionType === 'combo') {
    if (comboItems.length === 0) errors.push('combo question items missing');
    if (comboItems.length < 2 || comboItems.length > 6) {
      errors.push('combo question must have 2-6 combo items');
    }
    const keys = comboItems.map((_: unknown, index: number) =>
      ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ'][index],
    );
    const answerNumber = parseCorrectAnswer(answerValue);
    const answerText = answerNumber !== null ? optionText(options[answerNumber - 1]) : String(answerValue ?? '');
    const answerKeys = comboAnswerKeys(answerText, keys);
    if (answerKeys.length === 0 && typeof answerValue === 'string') {
      answerKeys.push(...comboAnswerKeys(answerValue, keys));
    }
    if (answerKeys.length === 0) errors.push('combo correct answer has no valid item keys');
  } else {
    const answer = parseCorrectAnswer(answerValue);
    if (answer === null || answer > options.length) errors.push('normal correct answer must be 1-5');
    if (questionType === 'unknown') errors.push('question type is not recognized');
  }

  return errors;
}

function expectedComboO(realQ: any): string[] {
  const items = questionComboItems(realQ);
  const answer = parseCorrectAnswer(realQ?.correct_answer ?? realQ?.answer);
  if (items.length === 0 || answer === null) return [];
  const keys = items.map((_: unknown, index: number) => ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ'][index]);
  return comboAnswerKeys(optionText(questionOptions(realQ)[answer - 1]), keys);
}

function validateHighlight(
  highlight: ConceptHighlightV2,
  questionStem: string,
  correctAnswer: number | null,
  comboItems?: string[],
  expectedComboO?: string[],
): ValidationResult {
  const optionAnalysis = Array.isArray(highlight?.optionAnalysis) ? highlight.optionAnalysis : [];
  const totalOptions = optionAnalysis.length;
  const oCount = optionAnalysis.filter((o) => o?.verdict === 'O').length;
  const xCount = optionAnalysis.filter((o) => o?.verdict === 'X').length;
  const warnings: string[] = [];
  const hasComboItems = Array.isArray(comboItems) && comboItems.length > 0;
  const questionType = detectQuestionType(questionStem, hasComboItems);

  let valid = true;

  if (questionType === 'unknown') {
    warnings.push('문제 유형을 인식할 수 없음');
    valid = false;
  }
  if (questionType === 'combo' && !hasComboItems) {
    warnings.push('합답형 보기 항목 없음');
    valid = false;
  }

  // 조합형: optionKey 형식 검증
  if (hasComboItems) {
    const expectedKeys = comboItems!.map((_, i) => ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ'][i] || `${i + 1}`);
    
    // optionKey 사용 확인
    const allHaveKey = optionAnalysis.every((o: any) => typeof o?.optionKey === 'string');
    const anyHaveNum = optionAnalysis.some((o: any) => typeof o?.optionNum === 'number');
    
    if (anyHaveNum) {
      warnings.push(`조합형인데 optionNum 사용됨 — optionKey로 변경 필요`);
      valid = false;
    }
    if (!allHaveKey) {
      warnings.push(`조합형 optionAnalysis에 optionKey 누락`);
      valid = false;
    }
    if (totalOptions !== comboItems!.length) {
      warnings.push(`조합형 optionAnalysis ${totalOptions}개 (보기 ${comboItems!.length}개와 불일치)`);
      valid = false;
    }
    // 키 순서 확인
    const actualKeys = optionAnalysis.map((o: any) => o?.optionKey);
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      warnings.push(`조합형 optionKey 순서 불일치: ${actualKeys.join(',')} (예상: ${expectedKeys.join(',')})`);
      valid = false;
    }
  } else {
    // 일반형: optionNum 형식 검증
    const allHaveNum = optionAnalysis.every((o: any) => typeof o?.optionNum === 'number');
    if (!allHaveNum) {
      warnings.push(`일반형 optionAnalysis에 optionNum 누락`);
      valid = false;
    }
    const actualNums = optionAnalysis.map((o: any) => o?.optionNum);
    if (totalOptions !== 5 || JSON.stringify(actualNums) !== JSON.stringify([1, 2, 3, 4, 5])) {
      warnings.push('일반형 optionAnalysis는 optionNum 1-5를 순서대로 가져야 함');
      valid = false;
    }
  }

  switch (questionType) {
    case 'single_correct':
      if (correctAnswer === null) {
        warnings.push('정답 번호 없음');
        valid = false;
        break;
      }
      if (oCount !== 1) {
        warnings.push(`단일 정답형이지만 O가 ${oCount}개 (1개만 O여야 함)`);
        valid = false;
      }
      // 정답 선지가 O인지 확인
      const correctVerdict = optionAnalysis.find((o: any) => o?.optionNum === correctAnswer)?.verdict;
      if (correctVerdict !== 'O') {
        warnings.push(`정답(${correctAnswer}번)이 O가 아님 (현재: ${correctVerdict})`);
        valid = false;
      }
      break;

    case 'find_wrong':
      if (correctAnswer === null) {
        warnings.push('정답 번호 없음');
        valid = false;
        break;
      }
      if (xCount !== 1) {
        warnings.push(`오답 찾기형이지만 X가 ${xCount}개 (1개만 X여야 함)`);
        valid = false;
      }
      // 정답 선지가 X인지 확인
      const wrongVerdict = optionAnalysis.find((o: any) => o?.optionNum === correctAnswer)?.verdict;
      if (wrongVerdict !== 'X') {
        warnings.push(`정답(${correctAnswer}번)이 X가 아님 (현재: ${wrongVerdict})`);
        valid = false;
      }
      break;

    case 'combo':
      if (hasComboItems) {
        // optionKey 형식: 각 보기 항목의 O/X만 검증
        // correct_answer로부터 어떤 항목이 O여야 하는지 역산할 수 없으므로,
        // 최소한 모든 O/X가 있고, 전부 X가 아니며, 전부 O도 아닌지 확인
        if (oCount === 0) {
          warnings.push(`조합형인데 O가 0개 (최소 1개는 O여야 함)`);
          valid = false;
        }
        if (xCount === 0) {
          warnings.push(`조합형인데 X가 0개 (최소 1개는 X여야 함)`);
          valid = false;
        }
        if (expectedComboO && expectedComboO.length > 0) {
          const actualO = optionAnalysis.filter((o: any) => o?.verdict === 'O').map((o: any) => o.optionKey);
          if (expectedComboO.some((key) => !actualO.includes(key)) || actualO.some((key) => !expectedComboO.includes(key))) {
            warnings.push('조합형 O/X 패턴이 정답과 불일치');
            valid = false;
          }
        }
      } else {
        // 구형식: optionNum + O=1 검증
        const correctVerdict = optionAnalysis.find((o: any) => o?.optionNum === correctAnswer)?.verdict;
        if (correctVerdict !== 'O') {
          warnings.push(`합답형 정답(${correctAnswer}번)이 O가 아님 (현재: ${correctVerdict})`);
          valid = false;
        }
        if (oCount > 1) {
          warnings.push(`합답형인데 O가 ${oCount}개 (1개만 O여야 함)`);
          valid = false;
        }
      }
      if (oCount === totalOptions && totalOptions >= 3) {
        warnings.push(`합답형인데 모든 선지(${totalOptions}개)가 O (비정상)`);
        valid = false;
      }
      break;
  }

  // 공통 검증
  if (!highlight || !Array.isArray(highlight.optionAnalysis) || optionAnalysis.length === 0) {
    warnings.push('optionAnalysis가 비어있음');
    valid = false;
  }

  // reasoning 길이 체크
  if (!Array.isArray(highlight?.stimulusClues) || highlight.stimulusClues.length === 0) {
    warnings.push('stimulusClues가 비어있음');
    valid = false;
  }
  if (!Array.isArray(highlight?.solvingFlow) || highlight.solvingFlow.length < 3) {
    warnings.push('solvingFlow가 3단계 미만');
    valid = false;
  }
  if (typeof highlight?.takeaway !== 'string' || highlight.takeaway.trim().length < 5) {
    warnings.push('takeaway가 비어있음');
    valid = false;
  }

  for (const opt of optionAnalysis) {
    if (!opt?.reasoning || opt.reasoning.trim().length < 5 || !['O', 'X'].includes(opt.verdict)) {
      warnings.push(`${(opt as any).optionNum ?? (opt as any).optionKey}번 reasoning이 너무 짧음`);
      valid = false;
      break;
    }
  }

  return {
    valid,
    questionType,
    expectedO: questionType === 'find_wrong' ? totalOptions - 1 : questionType === 'single_correct' ? 1 : '1개 내외',
    actualO: oCount,
    expectedX: questionType === 'find_wrong' ? 1 : questionType === 'single_correct' ? totalOptions - 1 : '나머지',
    actualX: xCount,
    warnings,
  };
}

// ============================================================
// 유틸
// ============================================================
function stimulusDataToPlainText(sd: any): string {
  if (!sd) return '';
  if (typeof sd === 'string') return sd;
  if (Array.isArray(sd)) return sd.map(stimulusDataToPlainText).filter(Boolean).join('\n');
  if (typeof sd !== 'object') return '';
  return Object.values(sd)
    .map(stimulusDataToPlainText)
    .filter(Boolean)
    .join('\n');
}

function getPlainStimulus(realQ: any): string {
  for (const value of [realQ?.stimulus, realQ?.rawStimulus, realQ?.render_ready?.stimulus_data]) {
    const text = stimulusDataToPlainText(value).trim();
    if (text) return text;
  }
  return '';
}

function hasValidSavedHighlight(realQ: any, highlight: unknown): boolean {
  const stem = String(realQ?.render_ready?.question_stem || realQ?.stem || '');
  const answer = parseCorrectAnswer(realQ?.correct_answer ?? realQ?.answer);
  const validation = validateHighlight(
    highlight as ConceptHighlightV2,
    stem,
    answer,
    questionComboItems(realQ),
    expectedComboO(realQ),
  );
  const rawStimulus = getPlainStimulus(realQ);
  return validation.valid && quotesMatchStimulus(highlight, rawStimulus);
}

function quotesMatchStimulus(highlight: unknown, rawStimulus: string): boolean {
  const clues = (highlight as ConceptHighlightV2)?.stimulusClues;
  return rawStimulus.length > 0 && Array.isArray(clues) && clues.length > 0 && clues.every(
    (clue) => typeof clue?.quote === 'string' && clue.quote.trim().length > 0 && rawStimulus.includes(clue.quote.trim()),
  );
}

function parseCorrectAnswer(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
  }
  if (typeof value === 'string') {
    const map: Record<string, number> = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
    const match = value.trim().match(/^(?:정답\s*[:：]?\s*)?([1-5]|[①②③④⑤])\s*번?$/u);
    if (match) return map[match[1]] ?? Number(match[1]);
  }
  return null;
}

function extractJson(text: string): any {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = codeBlock ? codeBlock[1].trim() : text.trim();
  return JSON.parse(raw);
}

// ============================================================
// OpenAI 호출
// ============================================================
async function generateHighlight(task: Task): Promise<ConceptHighlightV2 | null> {
  const { concept, realQ } = task;

  const stem = realQ.render_ready?.question_stem || realQ.stem || '';
  const answer = parseCorrectAnswer(realQ.correct_answer ?? realQ.answer);
  if (answer === null) return null;
  const rawStimulus = getPlainStimulus(realQ);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const client = getNextClient();

    const userContent = JSON.stringify({
      concept_name: concept.name,
      concept_definition: concept.card?.definition || concept.definition || '',
      question_stem: stem,
      stimulus: rawStimulus,
       options: questionOptions(realQ),
      correct_answer: answer,
       combo_items: questionComboItems(realQ),
    });

    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt + (attempt > 1 ? `\n\n[재시도 ${attempt}/${MAX_RETRIES}] 이전 시도에서 O/X 패턴 또는 인용문 정합성 검증에 실패했습니다. 더 신중하게, 위 규칙을 엄격히 지켜 다시 작성하세요.` : '') },
          { role: 'user', content: userContent },
        ],
        temperature: attempt <= 2 ? 0.3 : attempt === 3 ? 0.5 : attempt === 4 ? 0.7 : 1.0,
      });

      const content = response.choices[0]?.message?.content ?? '';
      const highlight = extractJson(content) as ConceptHighlightV2;

      // 검증 1: O/X 패턴
       const validation = validateHighlight(highlight, stem, answer, questionComboItems(realQ), expectedComboO(realQ));
      if (!validation.valid) {
        console.warn(
          `  ⚠️  [${concept.name}] 시도 ${attempt}/${MAX_RETRIES} — 검증 실패: ${validation.warnings.join(' | ')}`,
        );
        continue; // 재시도
      }

      // 검증 2: stimulusClues quote가 rawStimulus에 정확히 존재하는지
      const missingQuotes = (highlight.stimulusClues || []).filter(
        (clue) => {
          const q = typeof clue?.quote === 'string' ? clue.quote.trim() : '';
          return !q || !rawStimulus || rawStimulus.indexOf(q) === -1;
        },
      );
      if (missingQuotes.length > 0) {
        console.warn(
          `  ⚠️  [${concept.name}] 시도 ${attempt}/${MAX_RETRIES} — stimulusClues ${missingQuotes.length}개 불일치`,
        );
        continue; // 재시도
      }

      console.log(
        `  ✓  [${concept.name}] 통과 (시도 ${attempt}, ${validation.questionType}, O=${validation.actualO}, X=${validation.actualX})`,
      );
      return highlight;
    } catch (e) {
      console.error(
        `  ✗  [${concept.name}] 시도 ${attempt}/${MAX_RETRIES} — API 오류: ${(e as Error).message}`,
      );
      if (attempt < MAX_RETRIES) continue;
    }
  }

  console.error(`  ✗✗ [${concept.name}] ${MAX_RETRIES}회 시도 모두 실패`);
  return null;
}

// ============================================================
// 배치 처리
// ============================================================
async function processBatch(tasks: Task[]): Promise<
  Map<string, { idx: number; highlight: ConceptHighlightV2 }[]>
> {
  const results = new Map<string, { idx: number; highlight: ConceptHighlightV2 }[]>();

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (task) => {
      console.log(`\n  🔄 [${task.concept.name}] 생성 중...`);
      const highlight = await generateHighlight(task);
      if (highlight) {
        return { task, highlight };
      }
      return null;
    });

    const batchResults = await Promise.all(promises);
    for (const result of batchResults) {
      if (!result) continue;
      const { task, highlight } = result;
      if (!task.filePath || task.conceptIdx === undefined) continue;
      if (!results.has(task.filePath)) results.set(task.filePath, []);
      results.get(task.filePath)!.push({ idx: task.conceptIdx, highlight });
    }

    if (i + CONCURRENCY < tasks.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
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
  highlight: ConceptHighlightV2,
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

    // real_question 업데이트
    const existingRQ = cards[0].real_question || {};
    const updatedRQ = {
      ...existingRQ,
      conceptHighlightV2: highlight,
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
    console.error(`    ✗ Supabase 업데이트 오류: ${(e as Error).message}`);
    return false;
  }
}

interface SupabaseCard {
  id: string;
  name: string;
  unit_id: string;
  definition: string | null;
  enriched_definition: string | null;
  real_question: Record<string, any> | null;
}

async function loadExactSupabaseTargets(args: {
  subjects: string[];
  unitFilter: number[] | null;
}): Promise<{ tasks: Task[]; skipped: number }> {
  if (!supabase) throw new Error('Exact target mode requires SUPABASE_URL and SUPABASE_SERVICE_KEY');

  const dbSubjects = args.subjects.map((subject) => SUBJECT_CONFIG[subject].dbSubject);
  const { data: units, error: unitError } = await supabase
    .from('textbook_units')
    .select('id, subject, unit_number')
    .in('subject', dbSubjects);
  if (unitError) throw new Error(`Supabase units lookup failed: ${unitError.message}`);

  const unitMap = new Map<string, { subjectSlug: string; unitNumber: number }>();
  for (const unit of units ?? []) {
    const subjectSlug = args.subjects.find(
      (subject) => SUBJECT_CONFIG[subject].dbSubject === unit.subject,
    );
    if (subjectSlug) unitMap.set(unit.id, { subjectSlug, unitNumber: Number(unit.unit_number) });
  }
  const unitIds = [...unitMap.keys()].filter((id) => {
    const unitNumber = unitMap.get(id)!.unitNumber;
    return !args.unitFilter || args.unitFilter.includes(unitNumber);
  });
  if (unitIds.length === 0) return { tasks: [], skipped: 0 };

  const { data: cards, error: cardError } = await supabase
    .from('textbook_concept_cards')
    .select('id, name, unit_id, definition, enriched_definition, real_question')
    .in('unit_id', unitIds);
  if (cardError) throw new Error(`Supabase cards lookup failed: ${cardError.message}`);

  const tasks: Task[] = [];
  let skipped = 0;
  for (const card of (cards ?? []) as SupabaseCard[]) {
    const realQuestion = card.real_question;
    const questionData = realQuestion?.questionData;
    const location = unitMap.get(card.unit_id)!;
    const reasons: string[] = [];
    if (!questionData || typeof questionData !== 'object') reasons.push('questionData missing');
    if (hasValidSavedHighlight(questionData, realQuestion?.conceptHighlightV2)) {
      reasons.push('valid highlight already exists');
    }
    if (questionData) reasons.push(...validateQuestion(questionData));
    if (reasons.length > 0) {
      skipped++;
      console.log(`  [SKIP] ${location.subjectSlug}/${location.unitNumber}/${card.name} — ${reasons.join('; ')}`);
      continue;
    }
    tasks.push({
      concept: {
        name: card.name,
        definition: card.definition,
        enriched_definition: card.enriched_definition,
      },
      realQ: questionData,
      cardId: card.id,
      existingRealQuestion: realQuestion!,
      subjectSlug: location.subjectSlug,
      unitNumber: location.unitNumber,
    });
  }
  return { tasks, skipped };
}

async function processExactSupabaseTargets(tasks: Task[], write: boolean): Promise<{ generated: number; saved: number }> {
  let generated = 0;
  let saved = 0;
  for (const task of tasks) {
    console.log(`\n  [GENERATE] ${task.subjectSlug}/${task.unitNumber}/${task.concept.name}`);
    const highlight = await generateHighlight(task);
    if (!highlight) continue;
    generated++;

    const answer = parseCorrectAnswer(task.realQ.correct_answer ?? task.realQ.answer);
    const validation = validateHighlight(
      highlight,
      task.realQ.render_ready?.question_stem || task.realQ.stem || '',
      answer,
      questionComboItems(task.realQ),
      expectedComboO(task.realQ),
    );
    const rawStimulus = getPlainStimulus(task.realQ);
    const quoteOk = Array.isArray(highlight.stimulusClues) && highlight.stimulusClues.every(
      (clue) => typeof clue?.quote === 'string' && clue.quote.trim() && rawStimulus.includes(clue.quote.trim()),
    );
    if (!validation.valid || !quoteOk) {
      console.warn(`  [SKIP] ${task.concept.name} — final validation failed`);
      continue;
    }
    if (!write) {
      console.log(`  [NO WRITE] ${task.concept.name} — validated only`);
      continue;
    }
    if (!supabase || !task.cardId) throw new Error('Supabase card identity missing');
    const { data: current, error: readError } = await supabase
      .from('textbook_concept_cards')
      .select('real_question')
      .eq('id', task.cardId)
      .single();
    if (readError) {
      console.warn(`  [SKIP] ${task.concept.name} — current row read failed: ${readError.message}`);
      continue;
    }
    const currentRealQuestion = (current?.real_question || {}) as Record<string, any>;
    if (hasValidSavedHighlight(task.realQ, currentRealQuestion.conceptHighlightV2)) {
      console.log(`  [SKIP] ${task.concept.name} — valid highlight appeared during run`);
      continue;
    }
    const { error: updateError } = await supabase
      .from('textbook_concept_cards')
      .update({ real_question: { ...currentRealQuestion, conceptHighlightV2: highlight } })
      .eq('id', task.cardId);
    if (updateError) {
      console.warn(`  [SKIP] ${task.concept.name} — write failed: ${updateError.message}`);
      continue;
    }
    saved++;
    console.log(`  [SAVED] ${task.concept.name}`);
  }
  return { generated, saved };
}

function estimateCost(calls: number): string {
  const pricing = MODEL_PRICING[MODEL];
  if (!pricing) return `모델 ${MODEL} 가격표 없음 (호출 ${calls}회)`;
  // Conservative planning estimate: ~1,500 input and ~900 output tokens per attempt.
  const inputTokens = calls * 1500;
  const outputTokens = calls * 900;
  const dollars = inputTokens / 1_000_000 * pricing.input + outputTokens / 1_000_000 * pricing.output;
  return `최대 ${calls}회, 약 $${dollars.toFixed(4)} (입력 1,500 + 출력 900 tokens/회, 재시도 포함)\n` +
    `   ${MODEL}: 입력 $${pricing.input}/1M, 출력 $${pricing.output}/1M`;
}

function estimateCostRange(targets: number): string {
  return `${estimateCost(targets)}\n   최대 재시도(${MAX_RETRIES}회/대상): ${estimateCost(targets * MAX_RETRIES)}`;
}

// ============================================================
// CLI 인자 파싱
// ============================================================
function parseArgs(): {
  subjects: string[];
  force: boolean;
  fixOnly: boolean;
  unitFilter: number[] | null;
  dryRun: boolean;
  exactTarget: boolean;
  generate: boolean;
  write: boolean;
} {
  const args = process.argv.slice(2);
  const result: ReturnType<typeof parseArgs> = {
    subjects: Object.keys(SUBJECT_CONFIG),
    force: false,
    fixOnly: false,
    unitFilter: null,
    dryRun: false,
    exactTarget: false,
    generate: false,
    write: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--force':
        result.force = true;
        break;
      case '--fix':
        result.fixOnly = true;
        result.force = true; // fix는 force를 암시
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--exact-target':
        result.exactTarget = true;
        break;
      case '--generate':
        result.generate = true;
        break;
      case '--write':
        result.write = true;
        break;
      case '--subject':
        if (args[i + 1] && SUBJECT_CONFIG[args[i + 1]]) {
          result.subjects = [args[i + 1]];
          i++;
        } else {
          console.error(`유효하지 않은 과목: ${args[i + 1]}. 사용 가능: ${Object.keys(SUBJECT_CONFIG).join(', ')}`);
          process.exit(1);
        }
        break;
      case '--units':
        if (args[i + 1]) {
          result.unitFilter = args[i + 1].split(',').map(Number).filter((n) => !isNaN(n));
          i++;
        }
        break;
      case '--help':
        console.log(`
사용법: npx ts-node regenerate-concept-highlights.ts [옵션]

옵션:
  --force          이미 conceptHighlightV2가 있어도 강제 재생성
  --fix            불일치가 감지된 개념만 재생성 (O/X 개수 검증 실패 건)
  --subject <slug> 특정 과목만 처리 (success | industry)
  --units <nums>   특정 단원만 처리 (쉼표 구분, 예: --units 2,4,9)
  --dry-run        실제 생성 없이 대상만 출력
  --exact-target   Supabase에서만 읽고, highlights 없는 유효 카드만 정확히 대상화
  --generate       exact-target 대상에 대해 OpenAI 생성 수행 (기본은 생성하지 않음)
  --write          --generate 결과를 Supabase에 저장 (questionData 보존)

기본값: 모든 과목, conceptHighlightV2가 없는 개념만 처리
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

  if (args.exactTarget) {
    const { tasks, skipped } = await loadExactSupabaseTargets(args);
    console.log(`\n📊 Exact target: ${tasks.length}개, skipped invalid/existing: ${skipped}개`);
    console.log(`   예상 API 호출 상한: ${args.generate ? tasks.length * MAX_RETRIES : 0}회`);
    console.log(`   예상 비용: ${args.generate ? estimateCostRange(tasks.length) : '$0.0000 (generation disabled)'}`);
    if (!args.generate) {
      console.log('   OpenAI generation disabled. Use --generate explicitly when approved.');
      return;
    }
    if (!args.write) console.log('   Write disabled: generated highlights will not be persisted.');
    const result = await processExactSupabaseTargets(tasks, args.write);
    console.log(`\n📊 Exact result: generated ${result.generated}/${tasks.length}, saved ${result.saved}/${tasks.length}`);
    return;
  }

  console.log('📋 설정:');
  console.log(`   과목: ${args.subjects.join(', ')}`);
  console.log(`   Force: ${args.force}`);
  console.log(`   Fix only: ${args.fixOnly}`);
  console.log(`   단원 필터: ${args.unitFilter?.join(', ') ?? '전체'}`);
  console.log(`   Dry run: ${args.dryRun}`);
  console.log(`   Supabase: ${supabase ? '연결됨' : '미연결 (JSON 파일만 저장)'}`);
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

        // real_question/questionData가 아예 없는 건 스킵 (생성 불가)
        if (!realQ) {
          if (args.dryRun) {
            console.log(`  [SKIP] ${concept.name} — questionData 없음 (AI 생성 대상 아님)`);
          }
          continue;
        }

        // 이미 conceptHighlightV2가 있고 force 모드가 아니면 스킵
        const hasV2 = !!concept.realQuestion?.conceptHighlightV2;
        const hasValidV2 = hasV2 && hasValidSavedHighlight(realQ, concept.realQuestion.conceptHighlightV2);
        if (hasValidV2 && !args.force) {
          continue;
        }
        // --fix 모드: 기존 데이터 검증 후 불일치만 재생성
        if (hasV2 && args.fixOnly) {
          const existingV2 = concept.realQuestion.conceptHighlightV2 as ConceptHighlightV2;
          const stem = realQ.render_ready?.question_stem || realQ.stem || '';
          const answer = parseCorrectAnswer(realQ.correct_answer ?? realQ.answer);
          const validation = validateHighlight(existingV2, stem, answer, questionComboItems(realQ), expectedComboO(realQ));
          if (validation.valid && quotesMatchStimulus(existingV2, getPlainStimulus(realQ))) {
            continue; // 검증 통과 → 스킵
          }
          console.log(`  [FIX] ${concept.name} — 불일치 감지: ${validation.warnings.join(' | ')}`);
        }

        allTasks.push({
          filePath,
          conceptIdx: i,
          concept,
          realQ,
        });
      }
    }
  }

  if (args.dryRun) {
    console.log(`\n📊 Dry run 결과:`);
    console.log(`   재생성 대상: ${allTasks.length}개`);
    console.log(`   └─ missing: ${allTasks.filter((t) => !t.concept.realQuestion?.conceptHighlightV2).length}개`);
    console.log(`   └─ force: ${allTasks.filter((t) => !!t.concept.realQuestion?.conceptHighlightV2).length}개`);
    return;
  }

  console.log(`\n🎯 총 ${allTasks.length}개 concept 처리 예정\n`);

  if (allTasks.length === 0) {
    console.log('처리할 항목 없음.');
    console.log('(--force 플래그를 사용하면 기존 데이터도 재생성합니다)');
    return;
  }

  // 확인
  console.log('계속하려면 5초 내에 Ctrl+C를 누르세요...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const results = await processBatch(allTasks);

  // 결과 저장
  let savedCount = 0;
  let supabaseSavedCount = 0;
  let validationWarnings = 0;

  for (const [filePath, highlights] of results) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    for (const { idx, highlight } of highlights) {
      const concept = data.concepts[idx];
      const realQ = concept.realQuestion?.questionData;
      const stem = realQ?.render_ready?.question_stem || realQ?.stem || '';
      const answer = parseCorrectAnswer(realQ?.correct_answer ?? realQ?.answer);

      // 최종 검증 (재검증 — generateHighlight에서 이미 통과했어야 함)
      const validation = validateHighlight(highlight, stem, answer, questionComboItems(realQ), expectedComboO(realQ));
      const rawStimulus = getPlainStimulus(realQ);
      const quoteOk = (highlight.stimulusClues || []).every(
        (clue) => {
          const q = clue.quote.replace(/\.{2,}$/, '').trim();
          return rawStimulus && rawStimulus.indexOf(q) !== -1;
        },
      );
      if (!validation.valid || !quoteOk) {
        validationWarnings++;
        console.warn(
          `  ⚠️  [${concept.name}] 최종 검증 실패 — 저장하지 않음: ${validation.warnings.join(' | ')}${!quoteOk ? ' | quote 불일치' : ''}`,
        );
        continue; // 저장 건너뜀
      }

      // JSON 파일 저장
      data.concepts[idx].realQuestion = data.concepts[idx].realQuestion || {};
      data.concepts[idx].realQuestion.conceptHighlightV2 = highlight;
      savedCount++;

      // Supabase 직접 저장
      const unitMatch = path.basename(filePath).match(/^(\d+)단원\.json$/);
      const unitNumber = unitMatch ? parseInt(unitMatch[1], 10) : 0;
      const subjectSlug = filePath.includes('success_cards_moi') ? 'success' : 'industry';

      if (supabase) {
        const supabaseOk = await updateSupabaseDirectly(
          subjectSlug,
          unitNumber,
          concept.name,
          highlight,
        );
        if (supabaseOk) supabaseSavedCount++;
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`💾 ${path.basename(filePath)} 저장 (${highlights.length}개 업데이트)`);
  }

  console.log(`\n========================================`);
  console.log(`📊 최종 결과:`);
  console.log(`   JSON 파일 저장: ${savedCount}/${allTasks.length}`);
  if (supabase) {
    console.log(`   Supabase 저장: ${supabaseSavedCount}/${allTasks.length}`);
  }
  console.log(`   검증 경고: ${validationWarnings}건`);
  console.log(`   실패: ${allTasks.length - savedCount}건`);
}

main().catch(console.error);
