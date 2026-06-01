import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

type SubjectFolder = 'kongil' | 'sungjik';

type CardType = 'IntroCard' | 'IntegratedConceptCard' | 'RecallLogicCard';

interface SummationCardContent {
  title: string;
  description: string;
  integrated_data: {
    table: string;
    visual_analysis: string;
    logic_flow: string;
  };
  bullet_points: string[];
  trap_points: string[];
  tags: string[];
}

interface SummationCard {
  id: number;
  type: CardType;
  content: SummationCardContent;
  interaction: 'Click' | 'Flip';
}

interface SummationDocument {
  subject: string;
  totalCards: number;
  cards: SummationCard[];
}

interface CliOptions {
  subject: SubjectFolder | 'all';
  unit?: number;
  startUnit?: number;
  endUnit?: number;
  model?: string;
}

interface DenseExtraction {
  subject?: string;
  unit?: string;
  unit_title?: string;
  learning_objectives?: string[];
  major_sections?: unknown[];
  tables?: unknown[];
  visuals?: unknown[];
  ebs_plus?: unknown[];
  concept_candidates?: unknown[];
  global_logic?: string[];
  must_not_be_lost?: string[];
}

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const TEXTBOOK_DIR = path.join(ROOT_DIR, 'textbook');
const EXTRACT_PROMPT_FILE = path.join(
  ROOT_DIR,
  'prompts',
  'textbook',
  'summation_extract_dense.txt',
);
const COMPOSE_PROMPT_FILE = path.join(
  ROOT_DIR,
  'prompts',
  'textbook',
  'summation_compose_cards.txt',
);

const SUBJECT_TITLE_MAP: Record<SubjectFolder, string> = {
  kongil: '공업 일반',
  sungjik: '성공적인 직업생활',
};

function main(): void {
  loadLocalEnv(path.join(ROOT_DIR, 'backend', '.env'));

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set.');
  }

  const options = parseArgs(process.argv.slice(2));
  const extractPromptTemplate = readText(EXTRACT_PROMPT_FILE);
  const composePromptTemplate = readText(COMPOSE_PROMPT_FILE);
  const openai = new OpenAI({ apiKey });

  void run(openai, extractPromptTemplate, composePromptTemplate, options).catch(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[error] ${message}`);
      process.exitCode = 1;
    },
  );
}

async function run(
  openai: OpenAI,
  extractPromptTemplate: string,
  composePromptTemplate: string,
  options: CliOptions,
): Promise<void> {
  const subjects: SubjectFolder[] =
    options.subject === 'all' ? ['kongil', 'sungjik'] : [options.subject];

  for (const subject of subjects) {
    const unitNumbers = resolveUnitNumbers(subject, options);

    for (const unitNumber of unitNumbers) {
      const sourcePath = path.join(
        TEXTBOOK_DIR,
        subject,
        `Unit_${String(unitNumber).padStart(2, '0')}.txt`,
      );
      const outputPath = path.join(
        TEXTBOOK_DIR,
        `${subject}_summation`,
        `${unitNumber}단원.md`,
      );
      const conceptsPath = path.join(
        TEXTBOOK_DIR,
        'concepts',
        subject,
        `Unit_${String(unitNumber).padStart(2, '0')}.json`,
      );

      if (!fs.existsSync(sourcePath)) {
        console.warn(`[skip] source not found: ${sourcePath}`);
        continue;
      }

      const sourceText = readText(sourcePath);
      const existingSummary = fs.existsSync(outputPath)
        ? readText(outputPath)
        : '';
      const concepts = fs.existsSync(conceptsPath)
        ? JSON.parse(readText(conceptsPath))
        : { concepts: [] };

      const extractSystemPrompt = [
        '너는 EBS 수능특강 교재 구조 복원 분석가다.',
        '이 단계에서는 예쁘게 요약하지 말고 정보 손실이 적은 중간 산출물을 만들어라.',
        '출력은 반드시 유효한 JSON 객체 하나만 생성하라.',
      ].join(' ');

      const extractUserPrompt = [
        extractPromptTemplate,
        '',
        '[SUBJECT]',
        SUBJECT_TITLE_MAP[subject],
        '',
        '[UNIT]',
        `${unitNumber}단원`,
        '',
        '[핵심 개념 목록]',
        JSON.stringify(concepts, null, 2),
        '',
        '[기존 요약본]',
        existingSummary || '(없음)',
        '',
        '[원문 교재]',
        sourceText,
      ].join('\n');

      const extraction = await callJsonObject<DenseExtraction>(openai, {
        model: options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o',
        temperature: 0.1,
        systemPrompt: extractSystemPrompt,
        userPrompt: extractUserPrompt,
      });

      const composeSystemPrompt = [
        '너는 EBS 수능특강 교재 요약 편집자다.',
        '앱과 호환되는 카드형 JSON을 만들되, 가능한 한 얇게 요약하지 마라.',
        '출력은 반드시 유효한 JSON 객체 하나만 생성하라.',
      ].join(' ');

      const composeUserPrompt = [
        composePromptTemplate,
        '',
        '[SUBJECT]',
        SUBJECT_TITLE_MAP[subject],
        '',
        '[UNIT]',
        `${unitNumber}단원`,
        '',
        '[핵심 개념 목록]',
        JSON.stringify(concepts, null, 2),
        '',
        '[기존 요약본]',
        existingSummary || '(없음)',
        '',
        '[고밀도 추출본]',
        JSON.stringify(extraction, null, 2),
        '',
        '[원문 교재]',
        sourceText,
      ].join('\n');

      const parsed = normalizeSummationDocument(
        await callJsonObject(openai, {
          model: options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o',
          temperature: 0.2,
          systemPrompt: composeSystemPrompt,
          userPrompt: composeUserPrompt,
        }),
      );
      const fenced = `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\`\n`;

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, fenced, 'utf-8');
      console.log(`[ok] ${subject} ${unitNumber}단원 -> ${outputPath}`);
    }
  }
}

function normalizeSummationDocument(raw: unknown): SummationDocument {
  if (!isRecord(raw)) {
    throw new Error('Model output is not an object.');
  }

  const subject = typeof raw.subject === 'string' ? raw.subject : '단원 요약';
  const rawCards = Array.isArray(raw.cards) ? raw.cards : [];

  if (rawCards.length === 0) {
    throw new Error('Model output does not contain cards.');
  }

  const cards: SummationCard[] = rawCards.map((card, index) => {
    if (!isRecord(card)) {
      throw new Error(`Card at index ${index} is invalid.`);
    }

    const content = isRecord(card.content) ? card.content : {};
    const integrated = isRecord(content.integrated_data)
      ? content.integrated_data
      : {};

    const typeValue = card.type;
    const type: CardType =
      typeValue === 'IntroCard' ||
      typeValue === 'IntegratedConceptCard' ||
      typeValue === 'RecallLogicCard'
        ? typeValue
        : 'IntegratedConceptCard';

    const interactionValue = card.interaction;
    const interaction: 'Click' | 'Flip' =
      interactionValue === 'Click' || interactionValue === 'Flip'
        ? interactionValue
        : type === 'IntroCard'
          ? 'Click'
          : 'Flip';

    return {
      id: typeof card.id === 'number' ? card.id : index + 1,
      type,
      content: {
        title: readString(content.title, `Card ${index + 1}`),
        description: readString(content.description),
        integrated_data: {
          table: readString(integrated.table),
          visual_analysis: readString(integrated.visual_analysis),
          logic_flow: readString(integrated.logic_flow),
        },
        bullet_points: readStringArray(content.bullet_points),
        trap_points: readStringArray(content.trap_points),
        tags: readStringArray(content.tags),
      },
      interaction,
    };
  });

  return {
    subject,
    totalCards:
      typeof raw.totalCards === 'number' ? raw.totalCards : cards.length,
    cards,
  };
}

async function callJsonObject<T>(
  openai: OpenAI,
  input: {
    model: string;
    temperature: number;
    systemPrompt: string;
    userPrompt: string;
  },
): Promise<T> {
  const response = await openai.chat.completions.create({
    model: input.model,
    temperature: input.temperature,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content ?? '';
  return extractJson(content) as T;
}

function resolveUnitNumbers(
  subject: SubjectFolder,
  options: CliOptions,
): number[] {
  if (options.unit !== undefined) {
    return [options.unit];
  }

  const start = options.startUnit ?? 1;
  const end = options.endUnit ?? getMaxExistingUnit(subject);
  const units: number[] = [];

  for (let unit = start; unit <= end; unit += 1) {
    units.push(unit);
  }

  return units;
}

function getMaxExistingUnit(subject: SubjectFolder): number {
  const dir = path.join(TEXTBOOK_DIR, subject);
  const files = fs.readdirSync(dir);
  const unitNumbers = files
    .map((file) => file.match(/^Unit_(\d+)\.txt$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => Number.parseInt(match[1], 10));

  return Math.max(...unitNumbers);
}

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = { subject: 'all' };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--subject':
        if (next !== 'kongil' && next !== 'sungjik' && next !== 'all') {
          throw new Error('--subject must be one of: kongil, sungjik, all');
        }
        options.subject = next;
        i += 1;
        break;
      case '--unit':
        options.unit = parseInteger(next, '--unit');
        i += 1;
        break;
      case '--start-unit':
        options.startUnit = parseInteger(next, '--start-unit');
        i += 1;
        break;
      case '--end-unit':
        options.endUnit = parseInteger(next, '--end-unit');
        i += 1;
        break;
      case '--model':
        if (!next) {
          throw new Error('--model requires a value');
        }
        options.model = next;
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.unit !== undefined) {
    delete options.startUnit;
    delete options.endUnit;
  }

  return options as CliOptions;
}

function parseInteger(value: string | undefined, flagName: string): number {
  if (!value) {
    throw new Error(`${flagName} requires a value`);
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${flagName} must be an integer`);
  }

  return parsed;
}

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1] : trimmed;
  return JSON.parse(candidate);
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function loadLocalEnv(envPath: string): void {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = readText(envPath).split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

main();
