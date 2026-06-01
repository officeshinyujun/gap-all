import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

type SubjectFolder = 'kongil' | 'sungjik';

interface CliOptions {
  subject: SubjectFolder;
  unit: number;
  model?: string;
}

interface StructuredSubsection {
  title: string;
  explanation: string;
  keyPoints: string[];
  table: string;
  visualGuide: string;
  supplementNote: string;
  examPoints: string[];
  pitfalls: string[];
}

interface StructuredSection {
  title: string;
  summary: string;
  subsections: StructuredSubsection[];
}

interface StructuredUnitDocument {
  subject: string;
  unit: string;
  unitTitle: string;
  learningObjectives: string[];
  sections: StructuredSection[];
  closingSummary: string[];
}

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const TEXTBOOK_DIR = path.join(ROOT_DIR, 'textbook');
const EXTRACT_PROMPT_FILE = path.join(
  ROOT_DIR,
  'prompts',
  'textbook',
  'structured_unit_extract.txt',
);
const COMPOSE_PROMPT_FILE = path.join(
  ROOT_DIR,
  'prompts',
  'textbook',
  'structured_unit_compose_merged_keypoints.txt',
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
  const unitLabel = `${options.unit}단원`;
  const paddedUnit = String(options.unit).padStart(2, '0');
  const sourcePath = path.join(
    TEXTBOOK_DIR,
    options.subject,
    `Unit_${paddedUnit}.txt`,
  );
  const conceptsPath = path.join(
    TEXTBOOK_DIR,
    'concepts',
    options.subject,
    `Unit_${paddedUnit}.json`,
  );
  const existingStructuredPath = path.join(
    TEXTBOOK_DIR,
    `${options.subject}_structured`,
    `${options.unit}단원.json`,
  );
  const outputPath = existingStructuredPath;

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source textbook text not found: ${sourcePath}`);
  }

  const sourceText = readText(sourcePath);
  const concepts = fs.existsSync(conceptsPath)
    ? JSON.parse(readText(conceptsPath))
    : { concepts: [] };
  const existingStructured = fs.existsSync(existingStructuredPath)
    ? readText(existingStructuredPath)
    : '(없음)';

  const extractSystemPrompt = [
    '너는 교재 구조를 보존하는 추출기다.',
    '소제목 단위 설명 재료를 손실 적게 추출하라.',
    '반드시 유효한 JSON 객체 하나만 출력하라.',
  ].join(' ');

  const extractUserPrompt = [
    extractPromptTemplate,
    '',
    '[SUBJECT]',
    SUBJECT_TITLE_MAP[options.subject],
    '',
    '[UNIT]',
    unitLabel,
    '',
    '[핵심 개념 목록]',
    JSON.stringify(concepts, null, 2),
    '',
    '[기존 구조화 문서]',
    existingStructured,
    '',
    '[원문 교재]',
    sourceText,
  ].join('\n');

  const extraction = await callJsonObject<Record<string, unknown>>(openai, {
    model: options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o',
    temperature: 0.1,
    systemPrompt: extractSystemPrompt,
    userPrompt: extractUserPrompt,
  });

  const composeSystemPrompt = [
    '너는 교재를 학생 친화적 설명형 문서로 재편집하는 편집자다.',
    'explanation은 비우고 keyPoints에 긴 서술형 문장을 넣어 설명 역할을 하게 하라.',
    '반드시 유효한 JSON 객체 하나만 출력하라.',
  ].join(' ');

  const composeUserPrompt = [
    composePromptTemplate,
    '',
    '[SUBJECT]',
    SUBJECT_TITLE_MAP[options.subject],
    '',
    '[UNIT]',
    unitLabel,
    '',
    '[핵심 개념 목록]',
    JSON.stringify(concepts, null, 2),
    '',
    '[기존 구조화 문서]',
    existingStructured,
    '',
    '[구조 추출본]',
    JSON.stringify(extraction, null, 2),
    '',
    '[원문 교재]',
    sourceText,
  ].join('\n');

  const parsed = normalizeStructuredUnitDocument(
    await callJsonObject<unknown>(openai, {
      model: options.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o',
      temperature: 0.2,
      systemPrompt: composeSystemPrompt,
      userPrompt: composeUserPrompt,
    }),
    {
      subject: SUBJECT_TITLE_MAP[options.subject],
      unit: unitLabel,
    },
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
  console.log(
    `[ok] structured (merged keypoints) ${options.subject} ${unitLabel} -> ${outputPath}`,
  );
}

function normalizeStructuredUnitDocument(
  raw: unknown,
  defaults: { subject: string; unit: string },
): StructuredUnitDocument {
  if (!isRecord(raw)) {
    throw new Error('Model output is not an object.');
  }

  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  if (rawSections.length === 0) {
    throw new Error('Model output does not contain sections.');
  }

  const sections: StructuredSection[] = rawSections.map(
    (section, sectionIndex) => {
      if (!isRecord(section)) {
        throw new Error(`Section at index ${sectionIndex} is invalid.`);
      }

      const rawSubsections = Array.isArray(section.subsections)
        ? section.subsections
        : [];

      if (rawSubsections.length === 0) {
        throw new Error(`Section ${sectionIndex + 1} has no subsections.`);
      }

      return {
        title: readString(section.title, `섹션 ${sectionIndex + 1}`),
        summary: readString(section.summary),
        subsections: rawSubsections.map((subsection, subsectionIndex) => {
          if (!isRecord(subsection)) {
            throw new Error(
              `Subsection at section ${sectionIndex + 1}, index ${subsectionIndex} is invalid.`,
            );
          }

          return {
            title: readString(
              subsection.title,
              `소제목 ${subsectionIndex + 1}`,
            ),
            explanation: readString(subsection.explanation),
            keyPoints: readStringArray(subsection.keyPoints),
            table: readString(subsection.table),
            visualGuide: readString(subsection.visualGuide),
            supplementNote: readString(subsection.supplementNote),
            examPoints: readStringArray(subsection.examPoints),
            pitfalls: readStringArray(subsection.pitfalls),
          };
        }),
      };
    },
  );

  return {
    subject: readString(raw.subject, defaults.subject),
    unit: readString(raw.unit, defaults.unit),
    unitTitle: readString(raw.unitTitle, defaults.unit),
    learningObjectives: readStringArray(raw.learningObjectives),
    sections,
    closingSummary: readStringArray(raw.closingSummary),
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

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--subject':
        if (next !== 'kongil' && next !== 'sungjik') {
          throw new Error('--subject must be one of: kongil, sungjik');
        }
        options.subject = next;
        i += 1;
        break;
      case '--unit':
        options.unit = parseInteger(next, '--unit');
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

  if (!options.subject) {
    throw new Error('--subject is required');
  }
  if (options.unit === undefined) {
    throw new Error('--unit is required');
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
