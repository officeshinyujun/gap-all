/**
 * Backfill only missing Study-card body fields.
 *
 * This intentionally does not select or update question/highlight columns.
 * Run without --apply to inspect the exact target set and source matches.
 */
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

type Subject = 'success' | 'industry';
type DbSubject = 'sungjik' | 'kongil';
type BodyField =
  | 'definition'
  | 'key_points'
  | 'enriched_definition'
  | 'textbook_excerpt';

type DbCard = {
  id: string;
  unit_id: string;
  name: string;
  definition: string | null;
  key_points: unknown;
  enriched_definition: string | null;
  textbook_excerpt: string | null;
  real_question: unknown;
};

type Unit = { id: string; subject: DbSubject; unit_number: number };

type Generated = {
  definition: string;
  key_points: string[];
  enriched_definition: string;
  textbook_excerpt: string;
};

type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

const ROOT = path.resolve(__dirname, '..', '..');
const TEXTBOOK = path.join(ROOT, 'textbook');
const MODEL = process.env.OPENAI_STUDY_CARD_MODEL ?? 'gpt-4o-mini';
const EXPECTED_TARGETS = 20;
const REQUEST_TIMEOUT_MS = 45_000;
const TARGET_FIELDS: BodyField[] = [
  'definition',
  'enriched_definition',
  'textbook_excerpt',
];
const BODY_FIELDS: BodyField[] = [
  'definition',
  'key_points',
  'enriched_definition',
  'textbook_excerpt',
];
const SUBJECTS: {
  subject: Subject;
  dbSubject: DbSubject;
  folder: string;
  cards: string;
}[] = [
  {
    subject: 'success',
    dbSubject: 'sungjik',
    folder: 'sungjik',
    cards: 'success_cards_moi',
  },
  {
    subject: 'industry',
    dbSubject: 'kongil',
    folder: 'kongil',
    cards: 'kongil_cards_moi',
  },
];

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'definition',
    'key_points',
    'enriched_definition',
    'textbook_excerpt',
  ],
  properties: {
    definition: { type: 'string', minLength: 40, maxLength: 1000 },
    key_points: {
      type: 'array',
      minItems: 3,
      maxItems: 8,
      items: { type: 'string', minLength: 8, maxLength: 300 },
    },
    enriched_definition: { type: 'string', minLength: 120, maxLength: 2400 },
    textbook_excerpt: { type: 'string', minLength: 30, maxLength: 1800 },
  },
};

function isMissing(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

function normalize(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : ''.toLowerCase().replace(/[\s·()（）[\]{}<>\-_/,:：.;!?~]+/gu, '');
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonIfPresent(file: string): any {
  return fs.existsSync(file) ? readJson(file) : null;
}

function tokens(value: unknown): string[] {
  return [...new Set(normalize(value).match(/[가-힣A-Za-z0-9]{2,}/gu) ?? [])];
}

function sourceMatch(name: string, candidates: any[]): any {
  const target = normalize(name);
  const exact = candidates.find((item) =>
    [item?.name, item?.card?.name, item?.canonicalName].some(
      (candidate) => normalize(candidate) === target,
    ),
  );
  if (exact) return exact;
  const targetTokens = tokens(name);
  return candidates
    .map((item) => {
      const candidateTokens = tokens(item?.name);
      const overlap = targetTokens.filter((token) =>
        candidateTokens.includes(token),
      );
      return {
        item,
        score:
          overlap.length /
          Math.max(targetTokens.length, candidateTokens.length, 1),
      };
    })
    .sort((a, b) => b.score - a.score)[0]?.score >= 0.5
    ? candidates
        .map((item) => {
          const overlap = targetTokens.filter((token) =>
            tokens(item?.name).includes(token),
          );
          return {
            item,
            score:
              overlap.length /
              Math.max(targetTokens.length, tokens(item?.name).length, 1),
          };
        })
        .sort((a, b) => b.score - a.score)[0].item
    : null;
}

function flattenStructured(structured: any): any[] {
  return (structured?.sections ?? []).flatMap((section: any) => [
    {
      title: section.title,
      summary: section.summary,
      explanation: section.explanation,
      keyPoints: section.keyPoints,
    },
    ...(section.subsections ?? []).map((subsection: any) => ({
      title: `${section.title} > ${subsection.title}`,
      summary: subsection.summary,
      explanation: subsection.explanation,
      keyPoints: subsection.keyPoints,
    })),
  ]);
}

function collectLocalText(value: unknown): string[] {
  if (typeof value === 'string') return [value.trim()];
  if (Array.isArray(value)) return value.flatMap(collectLocalText);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectLocalText);
  }
  return [];
}

function loadEvidence(
  subject: Subject,
  unitNumber: number,
  name: string,
): Record<string, unknown> | null {
  const meta = SUBJECTS.find((item) => item.subject === subject)!;
  const cardData = readJsonIfPresent(
    path.join(TEXTBOOK, meta.cards, `${unitNumber}단원.json`),
  );
  const sourceCard = sourceMatch(name, cardData?.concepts ?? []);
  const frequencyData = readJsonIfPresent(
    path.join(TEXTBOOK, `${meta.folder}_frequency`, `${unitNumber}단원.json`),
  );
  const frequencyCard = sourceMatch(name, frequencyData?.concepts ?? []);
  const rebuild = readJsonIfPresent(
    path.join(
      TEXTBOOK,
      '_v2',
      'study-rebuild',
      subject,
      `unit-${String(unitNumber).padStart(2, '0')}.json`,
    ),
  );
  const canonical =
    frequencyCard?.name ??
    rebuild?.canonicalTags?.find(
      (tag: string) => normalize(tag) === normalize(name),
    ) ??
    rebuild?.canonicalTags?.[
      rebuild?.cards?.findIndex(
        (card: any) => normalize(card.name) === normalize(name),
      )
    ] ??
    name;
  const structured = readJsonIfPresent(
    path.join(TEXTBOOK, `${meta.folder}_structured`, `${unitNumber}단원.json`),
  );
  const summation = readJsonIfPresent(
    path.join(
      TEXTBOOK,
      `${meta.folder}_summation_v2`,
      `${unitNumber}단원.json`,
    ),
  );
  const raw = fs.existsSync(
    path.join(
      TEXTBOOK,
      meta.folder,
      `Unit_${String(unitNumber).padStart(2, '0')}.txt`,
    ),
  )
    ? fs.readFileSync(
        path.join(
          TEXTBOOK,
          meta.folder,
          `Unit_${String(unitNumber).padStart(2, '0')}.txt`,
        ),
        'utf8',
      )
    : '';
  const parsed = ['moi_by_unit', 'suteck'].flatMap((folder) => {
    const file = path.join(
      TEXTBOOK,
      'parsed',
      meta.folder,
      folder,
      `${unitNumber}단원.json`,
    );
    return readJsonIfPresent(file) ?? [];
  });
  if (!sourceCard && !rebuild) return null;
  const tagTokens = tokens(canonical);
  const relevant = (items: any[], limit: number) =>
    items
      .filter((item) => {
        const haystack = JSON.stringify(item);
        return tagTokens.some((token) => haystack.includes(token));
      })
      .slice(0, limit);
  const rebuildCard = sourceMatch(name, (rebuild?.cards ?? []) as any[]);
  const sourceBody = sourceCard?.card ?? {};
  const excerpts = [
    sourceBody.textbookExcerpt,
    sourceBody.definition,
    frequencyCard?.definition,
    rebuildCard?.conceptContent?.textbookExcerpt,
    rebuildCard?.description,
    ...relevant(flattenStructured(structured), 8).flatMap((item) => [
      item.summary,
      item.explanation,
    ]),
    ...String(raw)
      .split(/\n\s*\n/u)
      .filter((paragraph) =>
        tagTokens.some((token) => paragraph.includes(token)),
      )
      .slice(0, 8),
    ...collectLocalText(sourceCard),
    ...collectLocalText(frequencyCard),
    ...collectLocalText(rebuildCard),
    ...collectLocalText(structured),
    ...collectLocalText(summation),
    ...collectLocalText(parsed),
  ]
    .map(text)
    .filter(Boolean)
    .flatMap((candidate) => {
      if (candidate.length <= 1800) return [candidate];
      const parts: string[] = [];
      for (let start = 0; start < candidate.length; start += 1800) {
        const part = candidate.slice(start, start + 1800).trim();
        if (part.length >= 30) parts.push(part);
      }
      return parts;
    });
  return {
    canonical_tag: canonical,
    source_card: {
      definition: sourceBody.definition ?? '',
      key_points: sourceBody.keyPoints ?? [],
      enriched_definition: sourceBody.enrichedDefinition ?? '',
      textbook_excerpt: sourceBody.textbookExcerpt ?? '',
      frequency: sourceCard?.frequency ?? null,
      sources: sourceCard?.sources ?? [],
    },
    structured_textbook: relevant(flattenStructured(structured), 10),
    frequency: frequencyCard ?? sourceCard?.frequency ?? null,
    frequency_data: relevant(frequencyData?.concepts ?? [], 8),
    summation: relevant(summation?.cards ?? [], 8),
    parsed_data: relevant(parsed, 6),
    textbook_excerpt_candidates: excerpts,
    local_rebuild_card: rebuildCard
      ? {
          description: rebuildCard.description,
          keyPoints: rebuildCard.keyPoints,
          conceptContent: rebuildCard.conceptContent,
        }
      : null,
  };
}

function parseArgs(): { apply: boolean } {
  const apply = process.argv.includes('--apply');
  if (
    process.argv.some(
      (arg) =>
        arg !== '--apply' &&
        arg !== '--dry-run' &&
        arg !== process.argv[0] &&
        arg !== process.argv[1],
    )
  ) {
    throw new Error('Only --apply or --dry-run is supported.');
  }
  return { apply };
}

function parseJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  return JSON.parse((fenced?.[1] ?? content).trim());
}

function validateGenerated(
  value: unknown,
  evidence: Record<string, unknown>,
): Generated {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('AI output is not an object');
  const result = value as Record<string, unknown>;
  if (
    Object.keys(result).some((key) => !BODY_FIELDS.includes(key as BodyField))
  )
    throw new Error('AI output has extra keys');
  const definition = text(result.definition);
  const enriched = text(result.enriched_definition);
  const keyPoints = Array.isArray(result.key_points)
    ? result.key_points.map(text)
    : [];
  if (definition.length < 40 || enriched.length < 120)
    throw new Error('AI body field is too short');
  if (keyPoints.length < 3 || keyPoints.some((point) => point.length < 8))
    throw new Error('AI key_points are invalid');
  const combined = JSON.stringify(value);
  if (/알 수 없|근거 부족|작성할 수 없|placeholder|내용 없음/iu.test(combined))
    throw new Error('AI output contains a placeholder/refusal');
  const evidenceText = JSON.stringify(evidence);
  const overlap = tokens(
    `${definition} ${enriched} ${keyPoints.join(' ')}`,
  ).filter((token) => evidenceText.includes(token));
  if (new Set(overlap).size < 2)
    throw new Error('AI output is not grounded in local evidence');
  const candidates = (evidence.textbook_excerpt_candidates as string[]) ?? [];
  const excerpt = candidates.find(
    (candidate) => candidate.length >= 30 && candidate.length <= 1800,
  );
  if (!excerpt) throw new Error('no bounded verbatim local textbook excerpt');
  return {
    definition,
    key_points: keyPoints,
    enriched_definition: enriched,
    textbook_excerpt: excerpt,
  };
}

function prompt(
  card: DbCard,
  unit: Unit,
  evidence: Record<string, unknown>,
): string {
  const missing = BODY_FIELDS.filter((field) => isMissing(card[field]));
  return `한국 수능 직업탐구 Study 카드의 비어 있는 본문 필드만 근거 기반으로 작성하라.
카드명과 문제 내용은 변경하거나 재작성하지 말고, 출력에는 본문 필드만 넣어라.
모든 내용은 아래 원본 로컬 자료에서만 추론하라. 수치·사례·용어를 새로 만들지 마라.
textbook_excerpt는 아래 textbook_excerpt_candidates 중 하나의 연속된 원문을 그대로 복사해야 한다.
빈 필드: ${missing.join(', ')}
과목/단원: ${unit.subject}/${unit.unit_number}
입력 자료:
${JSON.stringify({ card: { name: card.name, existing_body: { definition: card.definition, key_points: card.key_points, enriched_definition: card.enriched_definition, textbook_excerpt: card.textbook_excerpt } }, evidence }, null, 2).slice(0, 42000)}
JSON schema에 맞는 JSON 객체만 출력하라.`;
}

async function generate(
  client: OpenAI,
  card: DbCard,
  unit: Unit,
  evidence: Record<string, unknown>,
): Promise<{ result: Generated; usage: Usage }> {
  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'study_card_body',
        strict: true,
        schema: OUTPUT_SCHEMA,
      },
    },
    messages: [
      {
        role: 'system',
        content: '근거 기반 편집자. JSON schema 외의 내용은 출력하지 않는다.',
      },
      { role: 'user', content: prompt(card, unit, evidence) },
    ],
  } as any);
  const usage = response.usage;
  return {
    result: validateGenerated(
      parseJson(response.choices[0]?.message?.content ?? ''),
      evidence,
    ),
    usage: {
      prompt_tokens: usage?.prompt_tokens ?? 0,
      completion_tokens: usage?.completion_tokens ?? 0,
      total_tokens: usage?.total_tokens ?? 0,
    },
  };
}

function valueFor(field: BodyField, result: Generated): string | string[] {
  return result[field];
}

async function updateMissing(
  supabase: any,
  card: DbCard,
  result: Generated,
): Promise<string[]> {
  const currentResult = await supabase
    .from('textbook_concept_cards')
    .select('definition, key_points, enriched_definition, textbook_excerpt')
    .eq('id', card.id)
    .single();
  if (currentResult.error || !currentResult.data) {
    throw new Error(
      `fresh row read: ${currentResult.error?.message ?? 'not found'}`,
    );
  }
  const current = currentResult.data as Pick<DbCard, BodyField>;
  const payload: Partial<Record<BodyField, string | string[]>> = {};
  for (const field of BODY_FIELDS) {
    if (isMissing(current[field])) payload[field] = valueFor(field, result);
  }
  const written = Object.keys(payload);
  if (!written.length) return [];
  const { data, error } = await supabase
    .from('textbook_concept_cards')
    .update(payload)
    .eq('id', card.id)
    .select('id');
  if (error) throw new Error(`update: ${error.message}`);
  if (!data?.length) throw new Error('update returned no row');
  return written;
}

async function main() {
  const args = parseArgs();
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey)
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required.');
  const supabase = createClient(supabaseUrl, supabaseKey);
  const unitsResult = await supabase
    .from('textbook_units')
    .select('id, subject, unit_number')
    .in('subject', ['sungjik', 'kongil']);
  if (unitsResult.error || !unitsResult.data)
    throw new Error(`Unit query failed: ${unitsResult.error?.message}`);
  const units = unitsResult.data as Unit[];
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const cardsResult = await supabase
    .from('textbook_concept_cards')
    .select(
      'id, unit_id, name, definition, key_points, enriched_definition, textbook_excerpt, real_question',
    )
    .in(
      'unit_id',
      units.map((unit) => unit.id),
    )
    .order('unit_id')
    .order('rank');
  if (cardsResult.error || !cardsResult.data)
    throw new Error(`Card query failed: ${cardsResult.error?.message}`);
  const allCards = cardsResult.data as DbCard[];
  const reportPath = path.join(
    ROOT,
    'backend',
    'tmp-study-card-body-backfill-report.json',
  );
  const previousReport = readJsonIfPresent(reportPath);
  const previousTargetIds = previousReport
    ? [
        ...(previousReport.updated_cards ?? []).map((card: any) => card.id),
        ...(previousReport.skipped ?? []).map((card: any) => card.id),
        ...(previousReport.errors ?? []).map((card: any) => card.id),
      ]
    : [];
  const targetIds = new Set(previousTargetIds);
  const targets = allCards.filter((card) =>
    targetIds.size
      ? targetIds.has(card.id) &&
        TARGET_FIELDS.some((field) => isMissing(card[field]))
      : TARGET_FIELDS.some((field) => isMissing(card[field])),
  );
  const verificationIds = targetIds.size
    ? [...targetIds]
    : targets.map((card) => card.id);
  const verificationTargets = allCards.filter((card) =>
    verificationIds.includes(card.id),
  );
  const before = previousReport?.before ?? countMissing(targets);
  const report: any = {
    mode: args.apply ? 'apply' : 'dry-run',
    model: MODEL,
    target_count: verificationIds.length,
    expected_target_count: EXPECTED_TARGETS,
    before,
    after: null,
    updated_cards: previousReport?.updated_cards ?? [],
    skipped: [],
    errors: [],
    protected_question_unchanged: null,
    usage: previousReport?.usage ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
  console.log(
    JSON.stringify(
      { mode: report.mode, target_count: targets.length, before },
      null,
      2,
    ),
  );
  if (!targetIds.size && targets.length !== EXPECTED_TARGETS)
    throw new Error(
      `Expected exactly ${EXPECTED_TARGETS} targets, found ${targets.length}. No writes performed.`,
    );
  if (!args.apply) return;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required with --apply.');
  const client = new OpenAI({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
  const protectedQuestions = new Map(
    verificationTargets.map((card) => [
      card.id,
      JSON.stringify(card.real_question),
    ]),
  );
  for (const card of targets) {
    const unit = unitById.get(card.unit_id);
    if (!unit) {
      report.skipped.push({
        id: card.id,
        name: card.name,
        reason: 'missing unit',
      });
      continue;
    }
    const subject = unit.subject === 'sungjik' ? 'success' : 'industry';
    try {
      const evidence = loadEvidence(subject, unit.unit_number, card.name);
      if (!evidence) {
        report.skipped.push({
          id: card.id,
          name: card.name,
          reason: 'missing local source match',
        });
        continue;
      }
      const generated = await generate(client, card, unit, evidence);
      report.usage.prompt_tokens += generated.usage.prompt_tokens;
      report.usage.completion_tokens += generated.usage.completion_tokens;
      report.usage.total_tokens += generated.usage.total_tokens;
      const written = await updateMissing(supabase, card, generated.result);
      report.updated_cards.push({
        id: card.id,
        subject,
        unit: unit.unit_number,
        name: card.name,
        written,
      });
      console.log(`updated ${card.id} ${card.name}: ${written.join(', ')}`);
    } catch (error) {
      report.errors.push({
        id: card.id,
        name: card.name,
        reason: error instanceof Error ? error.message : String(error),
      });
      console.error(
        `error ${card.id} ${card.name}: ${report.errors.at(-1).reason}`,
      );
    }
  }
  const verifyResult = await supabase
    .from('textbook_concept_cards')
    .select(
      'id, definition, key_points, enriched_definition, textbook_excerpt, real_question',
    )
    .in('id', verificationIds);
  if (verifyResult.error || !verifyResult.data)
    throw new Error(
      `Verification query failed: ${verifyResult.error?.message}`,
    );
  const verified = verifyResult.data as DbCard[];
  report.after = countMissing(verified);
  report.protected_question_unchanged = verified.every(
    (card) =>
      JSON.stringify(card.real_question) === protectedQuestions.get(card.id),
  );
  report.verification = {
    target_rows_read: verified.length,
    all_target_fields_present: verified.every((card) =>
      BODY_FIELDS.every((field) => !isMissing(card[field])),
    ),
    protected_columns_touched: false,
  };
  report.cost_estimate_usd = Number(
    (
      (report.usage.prompt_tokens * 0.15 +
        report.usage.completion_tokens * 0.6) /
      1_000_000
    ).toFixed(6),
  );
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`report: ${reportPath}`);
  if (
    !report.protected_question_unchanged ||
    !report.verification.all_target_fields_present ||
    report.errors.length
  )
    process.exitCode = 1;
}

function countMissing(cards: DbCard[]) {
  return Object.fromEntries(
    BODY_FIELDS.map((field) => [
      field,
      cards.filter((card) => isMissing(card[field])).length,
    ]),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
