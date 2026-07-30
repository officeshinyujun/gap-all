/**
 * Converts raw stimulus text into structured TPL stimulus data via LLM.
 *
 * Usage:
 *   npx ts-node scripts/convert-stimulus-to-tpl.ts [--dry-run] [--limit=N]
 *
 * Reads all reference_questions, parses each through parseReference to
 * determine its primary TPL, then sends the stimulus to an LLM with a
 * prompt that restructures the raw text into the TPL's stimulusData shape
 * while preserving ALL original content.
 *
 * The result is stored in source_payload.tplStimulusData on Supabase.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import {
  getTplSchema,
  type StructuredTplName,
} from '../src/exams/tpl-schemas';
import { parseReference } from '../src/exams/reference-selector.utils';
import {
  sourceTemplate,
  sourcePreservingRender,
} from '../src/exams/simply-reference-source-preserving.adapter';
import { validateSimplyReferenceStructuredTpl } from '../src/exams/simply-reference-generation-contract';
import { getOpenAIClient } from '../src/lib/openai-keys';

const CONCURRENCY = 5;
const RETRY_MAX = 2;

interface ConvertTask {
  sourceId: string;
  stimulus: string;
  tpl: StructuredTplName;
  schema: Record<string, unknown>;
}

function tplPromptDescription(tpl: StructuredTplName): string {
  const descriptions: Record<string, string> = {
    TPL_COMPARATIVE_MATRIX: `비교 매트릭스 (표 형태). 출력 필드:
- headers: 열 제목 배열 [{id, label}]. 원문의 열 제목을 그대로 사용.
- rows: 행 데이터 배열 [{id, cells}]. 각 cells는 headers와 같은 순서로 배열.
- selection_chips: 빈 배열 [].
표 형식이 아닌 줄은 첫 번째 행의 id를 "context"로 하고 그 내용을 첫 번째 cells에 포함.`,

    TPL_CONVERSATIONAL_FLOW: `대화 흐름. 출력 필드:
- participants: 대화 참여자 배열 [{id, name, role}]. 원문의 인물 이름 그대로 사용, role은 빈 문자열.
- messages: 대화 메시지 배열 [{p_id, text, timestamp}]. p_id는 participants의 id와 일치. timestamp는 순서 번호(문자열).
대화 형식("이름: 내용")이 아닌 줄은 이전 발화자의 text에 줄바꿈으로 이어붙임.`,

    TPL_CASE_DIAGNOSTIC_FRAME: `사례 진단 프레임. 출력 필드:
- case_profile: {name, context}. name은 원문의 인물/회사명. context는 빈 문자열.
- narrative: 원문 전체 내용을 하나의 문자열로.
- check_items: 빈 배열 [].`,

    TPL_SEQUENTIAL_WORKFLOW: `순차적 워크플로우. 출력 필드:
- steps: 단계 배열 [{idx, label, desc, is_missing}]. 원문의 순서/단계를 파싱.
  - idx: 순서 번호 (1부터)
  - label: 단계 레이블 (예: "1.", "•", 날짜)
  - desc: 단계 설명
  - is_missing: false
- orientation: "vertical"`,

    TPL_FORMAL_DOCUMENT: `공식 문서. 출력 필드:
- doc_type: 문서 유형 (예: "보고서", "계약서", "안내문")
- header_info: {title, date, author}. 원문에서 추출, 없으면 빈 문자열.
- paragraphs: 문단 배열 [{sub_title, content}]. 원문의 각 줄/문단을 content로.
- footnotes: 각주 배열. 원문의 * 표시 각주를 파싱.`,

    TPL_ARTICLE: `일반 원문 자료. 출력 필드:
- title: "원문 자료"
- source: 빈 문자열
- published_date: 빈 문자열
- body_paragraphs: 원문의 각 줄을 문자열 배열로.
- key_facts: 빈 배열 []`,
  };
  return descriptions[tpl] ?? '';
}

function buildPrompt(stimulus: string, tpl: StructuredTplName): string {
  return `CRITICAL: Copy EVERY character of the original Korean text VERBATIM into the JSON structure below. Do NOT omit, summarize, or rewrite ANY text. Every word, number, symbol, and line break from the STIMULUS must appear SOMEWHERE in the output JSON. If a line does not naturally fit the TPL structure, embed it as-is in the most appropriate string field.

TARGET TPL: ${tpl}
${tplPromptDescription(tpl)}

STIMULUS TO RESTRUCTURE (copy ALL of this):
${stimulus}

Return ONLY valid JSON.`;
}

async function convertOne(
  task: ConvertTask,
  attempt: number,
): Promise<Record<string, unknown> | null> {
  const prompt = buildPrompt(task.stimulus, task.tpl);
  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a precise data formatter. Restructure Korean text into structured JSON while preserving ALL original content exactly. Return only valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 4096,
    });
    const content = response.choices[0]?.message.content?.trim() ?? '';
    if (!content) return null;

    // Handle JSON wrapped in code blocks
    const cleaned = content.startsWith('```')
      ? content.replace(/```\w*\n?/g, '').trim()
      : content;

    const parsed = JSON.parse(cleaned);
    const valid = validateSimplyReferenceStructuredTpl(task.tpl, parsed);
    if (!valid) {
      if (attempt < RETRY_MAX) {
        return convertOne(task, attempt + 1);
      }
      console.error(
        `  [FAIL] ${task.sourceId} schema validation failed after ${attempt + 1} attempts`,
      );
      return null;
    }
    return parsed;
  } catch (err: any) {
    if (attempt < RETRY_MAX) {
      console.warn(
        `  [RETRY] ${task.sourceId} attempt ${attempt + 1}: ${err.message?.slice(0, 80)}`,
      );
      return convertOne(task, attempt + 1);
    }
    console.error(`  [FAIL] ${task.sourceId}: ${err.message?.slice(0, 120)}`);
    return null;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;

  console.log(
    `Mode: ${dryRun ? 'DRY RUN' : 'WRITE'}` +
      (limit > 0 ? `, Limit: ${limit}` : ''),
  );

  const url = process.env.DATABASE_SUPABASE_URL;
  if (!url) throw new Error('DATABASE_SUPABASE_URL required');

  const ds = new DataSource({
    type: 'postgres',
    url,
    connectTimeoutMS: 30000,
  });
  await ds.initialize();

  // 1. Read all questions and parse
  const rows = await ds.query(
    `SELECT id, logical_source_id, source_payload FROM reference_questions`,
  );

  const clearBad = process.argv.includes('--clear-bad');
  let reclaimed = 0;

  const tasks: (ConvertTask & { dbId: string })[] = [];
  for (const row of rows) {
    const ref = parseReference(row.source_payload, 'success');
    if (!ref.ok) continue;
    const tpl = sourceTemplate(ref.value);
    if (!tpl) continue;
    const schema = getTplSchema(tpl);
    if (!schema) continue;

    const stimulus = ref.value.stimulus;
    if (!stimulus.trim()) continue;

    // Adapter handles this → no LLM needed. Clear any stale cached data.
    if (sourcePreservingRender(ref.value) !== null) {
      const existing = row.source_payload?.tplStimulusData;
      if (clearBad && existing) {
        await ds.query(
          `UPDATE reference_questions SET source_payload = source_payload - 'tplStimulusData' WHERE id = $1`,
          [row.id],
        );
        reclaimed++;
      }
      continue;
    }

    // Skip if already has valid cached data from previous run
    const existing = row.source_payload?.tplStimulusData;
    if (
      existing &&
      typeof existing === 'object' &&
      validateSimplyReferenceStructuredTpl(tpl, existing)
    ) {
      continue;
    }

    tasks.push({
      dbId: row.id,
      sourceId: ref.value.source.sourceId,
      stimulus,
      tpl,
      schema: schema.schema,
    });
  }

  if (reclaimed > 0) console.log(`Reclaimed ${reclaimed} adapter-handled items`);

  const effective = limit > 0 ? tasks.slice(0, limit) : tasks;
  console.log(
    `Found ${tasks.length} adapter-failing tasks, processing ${effective.length}` +
      (dryRun ? ' (dry run)' : ''),
  );

  // 2. Process in parallel batches
  let success = 0;
  let failed = 0;

  for (let i = 0; i < effective.length; i += CONCURRENCY) {
    const batch = effective.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (task) => {
        const data = await convertOne(task, 0);
        return { task, data };
      }),
    );

    for (const { task, data } of results) {
      if (data !== null) {
        success++;
        if (!dryRun) {
          await ds.query(
            `UPDATE reference_questions
             SET source_payload = jsonb_set(
               COALESCE(source_payload, '{}'::jsonb),
               '{tplStimulusData}',
               $1::jsonb
             )
             WHERE id = $2`,
            [JSON.stringify(data), task.dbId],
          );
        }
        console.log(
          `  [OK] ${task.sourceId} (${task.tpl})` +
            (dryRun ? ' - DRY RUN' : ' - SAVED'),
        );
      } else {
        failed++;
      }
    }

    const progress = (
      (Math.min(i + CONCURRENCY, effective.length) / effective.length) *
      100
    ).toFixed(1);
    console.log(
      `Progress: ${Math.min(i + CONCURRENCY, effective.length)}/${effective.length} (${progress}%) | OK: ${success} FAIL: ${failed}`,
    );
  }

  console.log(`\nDONE. Success: ${success}, Failed: ${failed}`);
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
