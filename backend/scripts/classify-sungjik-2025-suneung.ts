import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import OpenAI from 'openai';

type Corpus = { source: Record<string, unknown>; questions: Record<string, unknown>[] };

const MODEL = 'gpt-4o-mini';

const UNIT_TOPICS: Record<number, string> = {
  1: '직업의 의미, 직업 가치관, 일과 직업',
  2: '생애 발달 단계, 발달 과업, 중년기, 청년기',
  3: '직업적 성공, 에릭슨 발달 이론, 개인 특성과 직업',
  4: '기업의 역할, 사회적 기업, 협동조합, 경제 주체',
  5: '경영 관리, 경영자, STP, 경영 참가 제도',
  6: '산업 분류, 생산재/소비재, 경공업/중공업, 개별 생산',
  7: '서비스업, 서비스 특성, 서비스 설계, 제조업과 서비스업 차이',
  8: '직업기초능력, 의사소통 능력, 문제 해결 능력, 대인 관계 능력',
  9: 'NCS(국가직무능력표준), 공정 채용, 직업 기초 능력',
  10: '능력단위, NCS 분류 체계, 구직 역량',
  11: '경력 개발, 평생 학습, 일학습 병행제',
  12: '취업 계획, 진로 의사 결정, 취업의 의미',
  13: '채용, 면접 유형, 블라인드 채용, 디지털 도구 활용',
  14: '창업, 사업자 등록, 자금 조달, 가맹점',
  15: '근로관계법, 근로 계약, 근로 시간, 임금',
  16: '근로자 보호, 남녀고용평등법, 부당 해고, 차별 금지',
  17: '고용보험, 구직 급여, 고용 서비스',
  18: '산업 안전, 안전 보건 표지, 사고 예방',
  19: '노사 관계, 노동조합, 노사 협력',
  20: '미래 사회, 녹색 성장, 직업 윤리, 미래 직업',
};

const CLASSIFICATION_PROMPT = `당신은 한국 성공적인 직업생활 교과의 문제 분류기입니다.
아래 문제의 내용을 보고, 어떤 단원에 해당하는지 판단하세요.

단원별 주제:
${Object.entries(UNIT_TOPICS).map(([u, t]) => `  ${u}단원: ${t}`).join('\n')}

반드시 지킬 것:
1. 문제의 stem, stimulus, choices를 읽고 가장 관련 깊은 단원 하나를 고르세요.
2. 해당 단원에서 다루는 핵심 개념 2~4개를 targetConcepts로 제시하세요.
3. Return valid json only: {"unitNumber": 숫자, "targetConcepts": ["개념1", "개념2", ...]}

주의: 단원 번호는 1~20 사이여야 합니다.`;

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required.');

  const root = path.resolve(process.cwd(), '..');
  const corpusPath = path.join(root, 'artifacts/reference-corpus-v2/moi_sungjik_2025_suneung_direct.json');
  const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as Corpus;

  const client = new OpenAI({ apiKey });
  let fixed = 0;

  for (const question of corpus.questions) {
    const qn = question.questionNumber;
    const existingUnit = numberValue(question.unitNumber);
    if (existingUnit >= 1 && arrayOfStrings(question.targetConcepts).length > 0) continue;

    const stem = stringValue(question.stem);
    const stimulus = stringValue(question.stimulus);
    const choices = (question.choices as string[] | undefined) ?? [];

    const userMessage = [
      `[문제 ${qn}]`,
      stem,
      stimulus ? `[자료] ${stimulus}` : '',
      `[선택지] ${choices.join(', ')}`,
    ].filter(Boolean).join('\n');

    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: CLASSIFICATION_PROMPT },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      });

      const raw = response.choices[0]?.message?.content;
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { unitNumber?: number; targetConcepts?: string[] };

      if (parsed.unitNumber && parsed.unitNumber >= 1 && parsed.unitNumber <= 20) {
        question.unitNumber = parsed.unitNumber;
        question.targetConcepts = parsed.targetConcepts ?? [];
        fixed += 1;
        process.stdout.write(`Q${qn}: 단원 ${parsed.unitNumber}, 개념 ${(parsed.targetConcepts ?? []).join(', ')}\n`);
      }
    } catch (error) {
      process.stderr.write(`Error Q${qn}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ fixed })}\n`);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}
function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
