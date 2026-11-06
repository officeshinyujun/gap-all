/**
 * 완전 AI 출제 엔진 스모크 테스트 (DB 없이 실제 LLM 호출).
 *
 * usage:
 *   node --env-file=.env -r ts-node/register scripts/generative-smoke.ts \
 *     --subject kongil --start 10 --end 11 --count 3 --difficulty HIGH [--out /tmp/gen.json]
 */
import { writeFileSync } from 'fs';
import { Difficulty } from '../src/entities/exam-record.entity';
import { planGenerativeExam, replanGenerativeItem } from '../src/exams/generative/generative-item-planner';
import { runGenerativePipeline } from '../src/exams/generative/generative-item-pipeline';
import { renderForSolver } from '../src/exams/generative/generative-item-assembler';
import { GenerativeLlmClient, generativeModelForRole } from '../src/exams/generative/generative-llm.client';
import type { GenerativeSubject } from '../src/exams/generative/generative.types';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
}

async function main(): Promise<void> {
  const request = {
    subject: arg('subject', 'kongil') as GenerativeSubject,
    startUnitNum: Number(arg('start', '10')),
    endUnitNum: Number(arg('end', '10')),
    questionCount: Number(arg('count', '2')),
    difficulty: arg('difficulty', 'MIDDLE') as Difficulty,
    seed: arg('seed', `smoke-${Date.now()}`),
  };
  console.log(`model=${generativeModelForRole('generation')} verifier=${generativeModelForRole('verification')}`);
  const specs = planGenerativeExam(request);
  for (const spec of specs) {
    console.log(`plan #${spec.ordinal} u${spec.unitNumber} ${spec.responseMode}/${spec.polarity} ans=${spec.answerIndex} ` +
      `concept=${spec.targetConcept.name} genre=${spec.material.genre} shape=${spec.stimulusShape} ${spec.points}점`);
  }
  const startedAt = Date.now();
  const result = await runGenerativePipeline(specs, new GenerativeLlmClient(), {
    concurrency: Number(arg('concurrency', '3')),
    replan: (failed, attempt, used) => replanGenerativeItem(request, failed, attempt, used),
  });
  for (const item of result.accepted) {
    console.log(`\n==== #${item.spec.ordinal} (attempt ${item.attempt}, 정답 ${item.question.correctAnswer}, 검토 ${item.solve.answerIndex}/${item.solve.ambiguity}) ====`);
    console.log(renderForSolver(item.question));
    console.log(`\n${item.question.explanation.judgment}`);
  }
  for (const rejection of result.rejected) {
    console.log(`\n[rejected #${rejection.spec.ordinal} attempt ${rejection.attempt}] ${rejection.code}: ${rejection.message}`);
  }
  const telemetry = [...result.accepted.flatMap((item) => item.telemetry), ...result.rejected.flatMap((item) => item.telemetry)];
  console.log(`\naccepted ${result.accepted.length}/${specs.length}, rejected attempts ${result.rejected.length}, ` +
    `${Math.round((Date.now() - startedAt) / 1000)}s, tokens in=${telemetry.reduce((s, t) => s + (t.promptTokens ?? 0), 0)} ` +
    `out=${telemetry.reduce((s, t) => s + (t.completionTokens ?? 0), 0)}`);
  const out = arg('out', '');
  if (out !== '') writeFileSync(out, JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
