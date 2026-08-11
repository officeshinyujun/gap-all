import 'dotenv/config';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import OpenAI from 'openai';

type Json = Record<string, unknown>;
type Corpus = { source: Json; questions: Json[] };

const MODEL = process.env.OPENAI_REFERENCE_EXPLANATION_MODEL ?? 'gpt-4o-mini';

const EXPLANATION_PROMPT = `당신은 한국 직업탐구 영역(공업 일반/성공적인 직업생활)의 전문 해설가입니다.
아래 문제와 정답을 보고, 왜 해당 선지가 정답인지 논리적으로 해설하세요.

규칙:
1. 문제에서 제시된 자료(stimulus)를 근거로 설명하세요. 자료에 없는 내용을 추정하지 마세요.
2. 각 선택지가 왜 맞고 틀리는지 간결하게 설명하세요.
3. 해설은 한국어로 200~400자 내외로 작성하세요.
4. "정답은 X번이다" 같은 불필요한 서두 없이 바로 해설을 시작하세요.
5. 반드시 사실에 기반하여 작성하고, 창작하지 마세요.`;

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required.');

  const root = path.resolve(process.cwd(), '..');
  const corpusDir = path.join(root, 'artifacts/reference-corpus-v2');
  const client = new OpenAI({ apiKey });

  const dryRun = process.argv.includes('--dry-run');
  let generated = 0;
  let skipped = 0;

  for (const file of readdirSync(corpusDir).filter((n) => n.endsWith('.json') && !n.includes('.bak'))) {
    const filePath = path.join(corpusDir, file);
    const corpus = JSON.parse(readFileSync(filePath, 'utf8')) as Corpus;
    if (corpus.source.sourceType !== 'moi') continue;

    let changed = false;
    for (const question of corpus.questions) {
      // Skip if already has a substantial explanation
      const existing = stringValue(question.generatedExplanation || question.explanation);
      if (existing.length > 100) {
        skipped += 1;
        continue;
      }

      const stem = stringValue(question.stem);
      const stimulus = stringValue(question.stimulus);
      const viewItems = (question.viewItems as string[] | undefined) ?? [];
      const choices = (question.choices as string[] | undefined) ?? [];
      const correctAnswer = question.correctAnswer;
      const targetConcepts = (question.targetConcepts as string[] | undefined) ?? [];

      if (!stem) continue;

      const userMessage = [
        `[문제] ${stem}`,
        stimulus ? `[자료] ${stimulus}` : '',
        viewItems.length > 0 ? `[보기]\n${viewItems.join('\n')}` : '',
        `[선택지]\n${choices.join('\n')}`,
        `[정답] ${correctAnswer}번`,
        targetConcepts.length > 0 ? `[관련 개념] ${targetConcepts.join(', ')}` : '',
      ].filter(Boolean).join('\n\n');

      if (dryRun) {
        generated += 1;
        continue;
      }

      try {
        const response = await client.chat.completions.create({
          model: MODEL,
          messages: [
            { role: 'system', content: EXPLANATION_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: 600,
        });

        const explanation = response.choices[0]?.message?.content?.trim();
        if (explanation) {
          question.generatedExplanation = explanation;
          question.generatedExplanationProvenance = 'gpt-generated';
          question.generatedExplanationVersion = 'v2-gpt';
          changed = true;
          generated += 1;
        }
      } catch (error) {
        process.stderr.write(`Error Q${question.questionNumber} in ${file}: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }

    if (changed && !dryRun) {
      writeFileSync(filePath, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
    }
  }

  process.stdout.write(
    `${JSON.stringify({ mode: dryRun ? 'dry-run' : 'write', generated, skipped, model: MODEL })}\n`,
  );
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
