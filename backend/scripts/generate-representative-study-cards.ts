/**
 * Generate complete Study cards from the unit's existing representative tags.
 *
 * Default: creates no AI request and no database change.
 *
 * Examples:
 *   npx ts-node --project tsconfig.json scripts/generate-representative-study-cards.ts \
 *     --subject success --unit 4 --dry-run
 *   npx ts-node --project tsconfig.json scripts/generate-representative-study-cards.ts \
 *     --subject success --unit 4 --generate
 */
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

type Args = {
  subject: 'success' | 'industry';
  unit: number;
  tag?: string;
  dryRun: boolean;
  generate: boolean;
};

type CandidateQuestion = {
  source: any;
  index: number;
};

const ROOT = path.resolve(__dirname, '..', '..');
const TEXTBOOK = path.join(ROOT, 'textbook');
const SUBJECTS = {
  success: { folder: 'sungjik', cards: 'success_cards_moi' },
  industry: { folder: 'kongil', cards: 'kongil_cards_moi' },
} as const;
const MODEL = process.env.OPENAI_STUDY_CARD_MODEL ?? 'gpt-4o-mini';
const MAX_RETRIES = 1;
const REQUEST_TIMEOUT_MS = 45_000;

function parseArgs(): Args {
  const args: Args = { subject: 'success', unit: 4, dryRun: false, generate: false };
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '--subject') args.subject = (process.argv[++i] ?? 'success') as Args['subject'];
    else if (arg === '--unit') args.unit = Number(process.argv[++i]);
    else if (arg === '--tag') args.tag = process.argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--generate') args.generate = true;
  }
  if (!SUBJECTS[args.subject] || !Number.isInteger(args.unit) || args.unit < 1) {
    throw new Error('--subject는 success/industry, --unit은 양의 정수여야 합니다.');
  }
  return args;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : text);
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s·()（）\-_/]+/gu, '')
    .trim();
}

function tokens(value: unknown): string[] {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[()（）/·,，:：]+/gu, ' ')
    .split(/\s+/u)
    .filter((token) => token.length >= 2);
}

function findTagScore(tagName: string, candidateName: string): number {
  const tag = normalize(tagName);
  const candidate = normalize(candidateName);
  if (!tag || !candidate) return 0;
  if (tag === candidate) return 100;
  if (candidate.startsWith(tag) || tag.startsWith(candidate)) return 80;
  const generic = new Set(['직업', '생활', '의미', '중요성', '유형', '방식', '기업']);
  const shared = tokens(tag).filter((token) =>
    !generic.has(token) && tokens(candidate).some((other) =>
      !generic.has(other) && (token.includes(other) || other.includes(token)),
    ),
  );
  return shared.length > 0 ? 40 + shared.length : 0;
}

function loadUnitData(subject: Args['subject'], unitNumber: number) {
  const meta = SUBJECTS[subject];
  const tagFile = path.join(TEXTBOOK, 'concepts', meta.folder, `Unit_${String(unitNumber).padStart(2, '0')}.json`);
  const cardFile = path.join(TEXTBOOK, meta.cards, `${unitNumber}단원.json`);
  const structuredFile = path.join(TEXTBOOK, `${meta.folder}_structured`, `${unitNumber}단원.json`);
  const questionsFile = path.join(TEXTBOOK, '_v2', 'normalized', subject, 'questions.json');
  const rawFile = path.join(TEXTBOOK, meta.folder, `Unit_${String(unitNumber).padStart(2, '0')}.txt`);
  const summationFile = path.join(TEXTBOOK, `${meta.folder}_summation_v2`, `${unitNumber}단원.json`);

  const tags = readJson<{ concepts: string[] }>(tagFile).concepts;
  const cards = readJson<{ concepts: any[] }>(cardFile).concepts;
  const structured = readJson<any>(structuredFile);
  const normalizedQuestions = fs.existsSync(questionsFile) ? readJson<any[]>(questionsFile) : [];
  const parsedQuestions = ['moi_by_unit', 'suteck']
    .map((folder) => path.join(TEXTBOOK, 'parsed', meta.folder, folder, `${unitNumber}단원.json`))
    .filter((filePath) => fs.existsSync(filePath))
    .flatMap((filePath) => readJson<any[]>(filePath));
  const questions = [...normalizedQuestions, ...parsedQuestions];

  return {
    tags,
    cards,
    structured,
    questions,
    rawText: fs.existsSync(rawFile) ? fs.readFileSync(rawFile, 'utf8') : '',
    summation: fs.existsSync(summationFile) ? readJson<any>(summationFile) : null,
  };
}

function buildEvidence(tag: string, data: ReturnType<typeof loadUnitData>) {
  const { cards, structured, questions } = data;
  const cardCandidates = cards
    .map((card, index) => ({
      index,
      name: card.name,
      score: findTagScore(tag, card.name),
      definition: card.card?.definition ?? '',
      enrichedDefinition: card.card?.enrichedDefinition ?? '',
      keyPoints: card.card?.keyPoints ?? [],
      textbookExcerpt: card.card?.textbookExcerpt ?? '',
      realQuestion: card.realQuestion ?? null,
      frequency: card.frequency ?? 0,
      sources: card.sources ?? [],
    }))
    .sort((left, right) => right.score - left.score);

  const structuredSections = (structured.sections ?? []).flatMap((section: any) =>
    (section.subsections ?? []).map((subsection: any) => ({
      sectionTitle: section.title,
      sectionSummary: section.summary,
      ...subsection,
      score: findTagScore(tag, `${section.title} ${subsection.title} ${subsection.keyPoints?.join(' ') ?? ''}`),
    })),
  ).sort((left: any, right: any) => right.score - left.score);

  const tagWords = tokens(tag).filter((word) => word.length >= 2);
  const questionCandidates: CandidateQuestion[] = questions
    .map((question, index) => {
      const text = [question.targetConcepts, question.stem, question.stimulus, question.options, question.choices]
        .flat(Infinity)
        .filter(Boolean)
        .join(' ');
      const score = tagWords.filter((word) => text.includes(word)).length;
      return { source: { ...question, _matchScore: score }, index };
    })
    .filter((item) => item.source._matchScore > 0)
    .sort((left, right) => right.source._matchScore - left.source._matchScore)
    .slice(0, 8);

  for (const card of cards) {
    const questionData = card.realQuestion?.questionData;
    if (!questionData) continue;
    const text = [questionData.stem, questionData.stimulus, questionData.options, questionData.choices]
      .flat(Infinity)
      .filter(Boolean)
      .join(' ');
    const score = Math.max(
      tagWords.filter((word) => text.includes(word)).length,
      findTagScore(tag, card.name) > 0 ? 1 : 0,
    );
    if (score > 0) {
      questionCandidates.push({
        index: -1,
        source: {
          id: `${card.id}:real-question`,
          sourceExam: questionData.source_exam ?? '',
          questionNumber: questionData.number ?? null,
          stem: questionData.stem ?? '',
          stimulus: questionData.stimulus ?? '',
          options: questionData.options ?? [],
          correctAnswer: questionData.answer ?? questionData.correct_answer ?? null,
          explanation: questionData.explanation ?? '',
          _matchScore: score,
          _fromCard: card.name,
        },
      });
    }
  }

  questionCandidates.sort((left, right) => right.source._matchScore - left.source._matchScore);

  return {
    tag,
    cards: cardCandidates.slice(0, 10),
    structuredSections: structuredSections.slice(0, 12),
    questions: questionCandidates,
    textbookEvidence: data.rawText
      .split(/\n\s*\n/u)
      .filter((paragraph) => tokens(tag).some((token) => token.length >= 2 && paragraph.includes(token)))
      .slice(0, 8),
    summation: data.summation,
  };
}

function buildPrompt(evidence: ReturnType<typeof buildEvidence>): string {
  return `당신은 한국 수능 직업탐구 Study 콘텐츠 편집자다.

대표 태그 하나를 현재 Study 카드 형식의 완성된 학습 단위로 재구성하라.
대표 태그명은 절대 변경하지 말고, 입력에 없는 문제·정답·수치·사례를 만들지 마라.
실제 문제의 본문·선지·정답은 입력 후보에서만 선택하고, AI는 개념 설명과 문제 적용 분석만 작성한다.

[대표 태그와 근거 데이터]
  ${JSON.stringify(evidence, null, 2).slice(0, 18000)}

[출력 JSON]
{
  "name": "입력 대표 태그 그대로",
  "description": "300~800자 Markdown 개념 설명",
  "conceptDefinition": {
    "summary": "80~220자 정의",
    "sections": [{"title":"세부 개념", "description":"판별 기준과 의미", "examples":["입력 근거의 예시"]}],
    "comparison": {"headers":["구분","핵심 기준"],"rows":[["입력 근거의 항목","입력 근거의 설명"]]},
    "commonConfusions": ["구체적인 혼동 포인트"]
  },
  "keyPoints": ["실전 핵심 포인트 3~5개"],
  "examTips": ["실제 출제 포인트 1~3개"],
  "subtopics": [{"name":"세부 개념 1", "evidence":"입력 근거", "examRelevance":"문제 적용 방식"}, {"name":"세부 개념 2", "evidence":"입력 근거", "examRelevance":"문제 적용 방식"}],
  "examMustKnow": {"title":"시험 전 꼭 외울 것", "type":"checklist", "mustRemember":["..."], "commonTraps":["..."], "reviewStatus":"review"},
  "selectedQuestionIndex": 0,
  "problemApplication": {
    "conceptUsage": "이 대표 태그가 입력된 실제 문제에서 어떻게 적용되는지 구체적으로 설명",
    "stimulusClues": [{"quote":"선택한 실제 문제의 원문 인용", "why":"판단 이유"}],
    "optionAnalysis": [{"optionNum":1,"verdict":"O 또는 X","reasoning":"선택지 판단"}],
    "solvingFlow": [{"step":1,"action":"풀이 단계"}],
    "takeaway":"이 문제를 통해 이 대표 태그를 적용하는 핵심 교훈"
  }
}

[검증 규칙]
- 기존 문제 후보가 없으면 selectedQuestionIndex는 -1로 출력하고 missingEvidence에 이유를 적어라.
- subtopics는 입력 근거에 실제로 있는 서로 다른 항목을 2~7개 작성하라. '세부 개념' 같은 placeholder를 사용하지 마라.
- conceptDefinition.sections도 실제 세부 개념을 2~6개 작성하라.
- conceptUsage·why·reasoning·action·takeaway는 입력 문제와 대표 태그에 맞는 구체적인 문장으로 작성하라.
- comparison은 실제 비교 근거가 있을 때만 넣어라.
- optionAnalysis의 optionNum과 verdict는 선택한 실제 문제의 선지에 맞춰라.
- generic한 문장이나 프롬프트의 예시 문장을 복사하지 마라.
- 정확한 JSON만 출력하라.`;
}

const PLACEHOLDERS = [
  '세부 개념',
  '이 개념이 문제에서 쓰이는 방식',
  '판단 이유',
  '풀이 단계',
  '핵심 교훈',
  '문제 적용 방식',
];

function containsPlaceholder(value: unknown): boolean {
  const text = JSON.stringify(value ?? '');
  return PLACEHOLDERS.some((placeholder) => text.includes(placeholder));
}

function parseAnswer(value: unknown): number {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  const circled = '①②③④⑤'.indexOf(text.match(/[①-⑤]/u)?.[0] ?? '');
  if (circled >= 0) return circled + 1;
  const number = Number.parseInt(text.replace(/[^0-9]/gu, ''), 10);
  return Number.isInteger(number) ? number : 0;
}

function validateCard(card: any, tag: string, evidence: ReturnType<typeof buildEvidence>) {
  const errors: string[] = [];
  if (card.name !== tag) errors.push('대표 태그명이 변경됨');
  if (!card.description || card.description.length < 50) errors.push('description 부족');
  if (!card.conceptContent) errors.push('conceptContent 없음');
  if (!card.conceptDefinition?.summary) errors.push('conceptDefinition.summary 없음');
  if (!Array.isArray(card.conceptDefinition?.sections) || card.conceptDefinition.sections.length < 2) errors.push('conceptDefinition.sections 부족');
  if (!Array.isArray(card.keyPoints) || card.keyPoints.length < 3) errors.push('keyPoints 부족');
  if (!Array.isArray(card.examTips) || card.examTips.length < 1) errors.push('examTips 부족');
  if (!Array.isArray(card.subtopics) || new Set(card.subtopics.map((item: any) => item?.name)).size < 2) errors.push('subtopics 부족');
  if (!card.examMustKnow || !Array.isArray(card.examMustKnow.mustRemember)) errors.push('examMustKnow 부족');
  const comparison = card.conceptDefinition?.comparison;
  if (comparison) {
    if (!Array.isArray(comparison.headers) || comparison.headers.length < 2) errors.push('비교표 headers 부족');
    if (!Array.isArray(comparison.rows) || comparison.rows.length < 1) errors.push('비교표 rows 부족');
    if (Array.isArray(comparison.headers) && Array.isArray(comparison.rows) && comparison.rows.some((row: any) => !Array.isArray(row) || row.length !== comparison.headers.length)) {
      errors.push('비교표 행·열 수 불일치');
    }
  }
  if (/형태|주체|책임|협동조합|공기업/u.test(tag) && !comparison) errors.push('필수 비교표 없음');
  const question = evidence.questions[Number(card.selectedQuestionIndex)];
  if (!question || !card.sampleQuestion) errors.push('기존 실제 문제 미연결');
  if (card.sampleQuestion && (!Number.isInteger(card.sampleQuestion.correct_answer) || card.sampleQuestion.correct_answer < 1)) errors.push('실제 문제 정답 없음');
  if (!card.problemApplication?.conceptUsage) errors.push('문제 적용 설명 없음');
  if (!Array.isArray(card.problemApplication?.stimulusClues) || !card.problemApplication.stimulusClues.length) errors.push('지문 단서 없음');
  if (!Array.isArray(card.problemApplication?.optionAnalysis) || !card.problemApplication.optionAnalysis.length) errors.push('선택지 분석 없음');
  if (!Array.isArray(card.problemApplication?.solvingFlow) || card.problemApplication.solvingFlow.length < 2) errors.push('풀이 흐름 부족');
  if (!card.problemApplication?.takeaway) errors.push('핵심 교훈 없음');
  if (containsPlaceholder(card)) errors.push('placeholder 또는 일반 예시 문장 포함');
  return errors;
}

function toStudyQuestion(source: any, tag: string): any {
  const nested = source.questionData ?? source.question ?? {};
  const sourceExam = source.sourceExam ?? source.source?.filename ?? '';
  const questionNumber = source.questionNumber ?? source.question_number ?? source.number ?? nested.number ?? null;
  const options = source.options ?? source.choices ?? nested.options ?? nested.choices ?? [];
  const answer = source.correctAnswer ?? source.answer ?? source.correct_answer ?? nested.correctAnswer ?? nested.answer ?? nested.correct_answer ?? null;
  return {
    metadata: {
      source_exam: sourceExam,
      question_number: questionNumber,
      target_concept: tag,
      item_type: '실제 기출문제',
    },
    render_ready: {
      question_stem: source.stem ?? source.question_stem ?? nested.stem ?? '',
      stimulus_data: (source.stimulus ?? nested.stimulus) ? { content: source.stimulus ?? nested.stimulus } : null,
      options_list: options,
      explanation: source.explanation ?? nested.explanation ?? '',
    },
    combo_block: null,
    correct_answer: parseAnswer(answer),
    questionSource: sourceExam,
    questionNumber,
    rawStimulus: source.stimulus ?? nested.stimulus ?? '',
  };
}

function finalizeGeneratedCard(
  card: any,
  tag: string,
  evidence: ReturnType<typeof buildEvidence>,
  rank: number,
): any {
  const requestedIndex = Number(card.selectedQuestionIndex);
  const selectedIndex = Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < evidence.questions.length
    ? requestedIndex
    : evidence.questions.length > 0 ? 0 : -1;
  const selected = evidence.questions[selectedIndex]?.source;
  const relatedQuestions = evidence.questions
    .filter((_, index) => index !== selectedIndex)
    .slice(0, 5)
    .map((item) => ({
      id: item.source.id,
      questionSource: item.source.sourceExam ?? item.source.source?.filename ?? '',
      questionNumber: item.source.questionNumber ?? item.source.number ?? null,
      correct_answer: parseAnswer(item.source.correctAnswer ?? item.source.answer ?? 0),
      rawStimulus: item.source.stimulus ?? '',
      conceptHighlightV2: null,
      question: toStudyQuestion(item.source, tag),
    }));
  const problemApplication = card.problemApplication ?? {};
  const conceptContent = [
    card.description ? `## 개념 정의\n${card.description}` : '',
    Array.isArray(card.keyPoints) && card.keyPoints.length
      ? `## 핵심 포인트\n${card.keyPoints.map((point: string) => `- ${point}`).join('\n')}`
      : '',
    Array.isArray(card.examTips) && card.examTips.length
      ? `## 실제 출제 패턴\n${card.examTips.map((tip: string) => `- ${tip}`).join('\n')}`
      : '',
    card.examMustKnow?.commonTraps?.length
      ? `## 오답 주의\n${card.examMustKnow.commonTraps.map((trap: string) => `- ${trap}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n');
  return {
    ...card,
    name: tag,
    rank,
    selectedQuestionIndex: selectedIndex,
    conceptContent,
    sampleQuestion: selected ? toStudyQuestion(selected, tag) : null,
    relatedQuestions,
    conceptHighlightV2: {
      stimulusClues: problemApplication.stimulusClues ?? [],
      optionAnalysis: problemApplication.optionAnalysis ?? [],
      solvingFlow: problemApplication.solvingFlow ?? [],
      takeaway: problemApplication.takeaway ?? '',
    },
    contentStatus: selected ? 'complete' : 'needs_review',
  };
}

async function generate(client: OpenAI, prompt: string): Promise<any> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '근거 기반 Study 편집자. JSON만 출력한다.' },
          { role: 'user', content: prompt },
        ],
      });
      return extractJson(response.choices[0]?.message?.content ?? '');
    } catch (error: any) {
      // ponytail: one bounded attempt; rerun only the failed tag instead of multiplying API cost.
      if (attempt === MAX_RETRIES || !isRetryableOpenAiError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('AI 생성 실패');
}

function isRetryableOpenAiError(error: any): boolean {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  return status === 408 || status === 409 || status === 429 || status >= 500 || error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT';
}

async function main() {
  const args = parseArgs();
  const data = loadUnitData(args.subject, args.unit);
  const evidence = data.tags
    .filter((tag) => !args.tag || tag === args.tag)
    .map((tag) => buildEvidence(tag, data));
  const outDir = path.join(TEXTBOOK, '_v2', 'study-rebuild', args.subject, `unit-${String(args.unit).padStart(2, '0')}`);
  fs.mkdirSync(outDir, { recursive: true });
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex');

  fs.writeFileSync(path.join(outDir, 'input.json'), JSON.stringify({ subject: args.subject, unit: args.unit, tags: data.tags, evidence, fingerprint }, null, 2));
  console.log(`대표 태그 ${data.tags.length}개 / 후보 입력 저장: ${outDir}`);
  evidence.forEach((item) => console.log(`- ${item.tag}: 카드 ${item.cards.length}개, 문제 ${item.questions.length}개, 구조화 섹션 ${item.structuredSections.length}개`));

  if (args.dryRun || !args.generate) return;
  const keys = [process.env.OPENAI_API_KEY, process.env.OPENAI_API_KEY2, process.env.OPENAI_API_KEY3].filter((key): key is string => Boolean(key));
  if (!keys.length) throw new Error('OPENAI_API_KEY가 필요합니다.');
  const clients = keys.map((key) => new OpenAI({ apiKey: key, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 }));
  const generated: any[] = [];
  for (let i = 0; i < evidence.length; i += 1) {
    const item = evidence[i];
    try {
      const card = finalizeGeneratedCard(
        await generate(clients[i % clients.length], buildPrompt(item)),
        item.tag,
        item,
        i + 1,
      );
      const errors = validateCard(card, item.tag, item);
      generated.push({ ...card, validationErrors: errors });
      console.log(`${errors.length ? '⚠️' : '✅'} ${i + 1}/${evidence.length} ${item.tag}${errors.length ? ` — ${errors.join(', ')}` : ''}`);
    } catch (error: any) {
      const reason = error instanceof SyntaxError ? 'AI 응답이 JSON 형식이 아님' : error?.message ?? String(error);
      generated.push({ name: item.tag, rank: i + 1, contentStatus: 'failed', validationErrors: [reason] });
      console.error(`❌ ${i + 1}/${evidence.length} ${item.tag} — ${reason}`);
    }
  }
  fs.writeFileSync(path.join(outDir, 'generated.json'), JSON.stringify(generated, null, 2));
  fs.writeFileSync(path.join(outDir, 'validation.json'), JSON.stringify({ complete: generated.every((card) => card.validationErrors.length === 0), cards: generated.map((card) => ({ name: card.name, errors: card.validationErrors })) }, null, 2));
  console.log('DB에는 쓰지 않았습니다. generated.json과 validation.json 검수 후 별도 반영하세요.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
