/** Rebuild only 공업 일반 concept tags from checked-in textbook sources. */
import * as fs from 'node:fs';
import * as path from 'node:path';

type Json = Record<string, any>;
type Status = 'matched' | 'textbook_only' | 'needs_review' | 'populated_from_structured';

const ROOT = path.resolve(__dirname, '..', '..');
const TEXTBOOK = path.join(ROOT, 'textbook');
const OUTPUT = path.join(TEXTBOOK, '_v2', 'rebuild', 'industry');
const STUDY_REBUILD_DIR = path.join(TEXTBOOK, '_v2', 'study-rebuild', 'industry');

function read<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function normalize(value: unknown): string {
  return (typeof value === 'string' ? value : '')
    .toLowerCase()
    .replace(/[\s·()（）\-_/.,，:：→]/gu, '');
}

function cardBody(value: Json): Json {
  return value.card && typeof value.card === 'object'
    ? { ...value, ...value.card }
    : value;
}

function structuredMatch(tag: string, structured: Json): Json | null {
  const needle = normalize(tag);
  const candidates = (structured.sections ?? [])
    .flatMap((section: Json) =>
      (section.subsections ?? []).map((subsection: Json) => ({
        section,
        subsection,
      })),
    )
    .filter(({ section, subsection }: Json) => {
      const text = normalize(`${section.title} ${subsection.title}`);
      return text === needle || text.includes(needle) || needle.includes(text);
    });
  if (candidates.length !== 1) return null;
  const { section, subsection } = candidates[0];
  const keyPoints = Array.isArray(subsection.keyPoints)
    ? subsection.keyPoints
    : [];
  const examTips = Array.isArray(subsection.examPoints)
    ? subsection.examPoints
    : [];
  const excerpt = [
    `## 개념 정의\n${subsection.explanation || section.summary || ''}`,
    keyPoints.length
      ? `## 핵심 포인트\n${keyPoints.map((point: string) => `- ${point}`).join('\n')}`
      : '',
    subsection.table ? `## 비교·정리\n${subsection.table}` : '',
    examTips.length
      ? `## 시험 출제 포인트\n${examTips.map((point: string) => `- ${point}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return {
    definition: subsection.explanation || section.summary || '',
    keyPoints,
    examTips,
    textbookExcerpt: excerpt,
    sources: [],
    frequency: 0,
  };
}

function studyRebuildMatch(
  tag: string,
  unit: number,
  studyRebuildDir: string,
): Json | null {
  const unitFileName = `unit-${String(unit).padStart(2, '0')}.json`;
  const unitFile = path.join(studyRebuildDir, unitFileName);
  if (!fs.existsSync(unitFile)) return null;
  const data = read<Json>(unitFile);
  const cards = data.cards ?? [];
  const needle = normalize(tag);
  const matches = cards.filter(
    (card: Json) => normalize(card.name) === needle,
  );
  if (matches.length !== 1) return null;
  return matches[0];
}

function parsedQuestion(tag: string, parsed: Json[]): Json | null {
  const matches = parsed.filter((question) => {
    const targets = question.targetConcepts ?? question.concepts ?? [];
    return (
      Array.isArray(targets) &&
      targets.some((target: unknown) => normalize(target) === normalize(tag))
    );
  });
  if (matches.length !== 1) return null;
  return matches[0];
}

function buildCard(
  unit: number,
  unitTitle: string,
  tag: string,
  rank: number,
  source: Json | null,
  structured: Json | null,
  question: Json | null,
  studyRebuild: Json | null,
): Json {
  const srConceptContent = studyRebuild?.conceptContent;
  const srTextbookExcerpt =
    typeof srConceptContent === 'object' && srConceptContent
      ? (srConceptContent.textbookExcerpt ?? srConceptContent.enrichedDefinition ?? '')
      : '';
  const srDefinition =
    typeof srConceptContent === 'object' && srConceptContent
      ? (srConceptContent.enrichedDefinition ?? srConceptContent.definition ?? '')
      : '';
  const srDescription = (studyRebuild as Json)?.description ?? '';

  const item = cardBody(source ?? structured ?? {});
  const definition =
    String(
      item.enrichedDefinition || item.definition || srDefinition || srDescription,
    ) || '';
  const keyPoints =
    item.keyPoints ?? item.key_points ?? studyRebuild?.keyPoints ?? [];
  const excerpt =
    String(
      item.textbookExcerpt ??
        item.textbook_excerpt ??
        srTextbookExcerpt ??
        definition,
    ) || '';
  const examTips =
    item.examTips ?? item.exam_points ?? studyRebuild?.examTips ?? [];
  const status: Status = source
    ? 'matched'
    : structured
      ? 'textbook_only'
      : studyRebuild
        ? 'populated_from_structured'
        : 'needs_review';
  return {
    id: item.id || `kongil_${unit}_${String(rank).padStart(2, '0')}`,
    subject: '공업 일반',
    subjectSlug: 'industry',
    unit,
    unitTitle,
    rank,
    name: tag,
    frequency: item.frequency ?? 0,
    sources: item.sources ?? [],
    description: definition,
    definition,
    enriched_definition: definition,
    enrichedDefinition: definition,
    keyPoints,
    key_points: keyPoints,
    examTips,
    textbookExcerpt: excerpt,
    textbook_excerpt: excerpt,
    conceptContent: excerpt || definition,
    sampleQuestion: item.realQuestion ?? item.sampleQuestion ?? question,
    realQuestion: item.realQuestion ?? null,
    relatedQuestions: item.relatedQuestions ?? [],
    sourceTag: tag,
    contentStatus: status === 'needs_review' ? 'missing' : 'complete',
    reviewStatus: status,
    _offline: {
      subject: 'industry',
      subjectKor: '공업 일반',
      unitNumber: unit,
      status,
      source: source
        ? 'textbook-frequency-and-cards'
        : structured
          ? 'textbook-structured'
          : studyRebuild
            ? 'study-rebuild-structured'
            : 'needs-review',
    },
  };
}

const tags: Json[] = [];
const report: Json = {
  mode: 'offline',
  network: false,
  database: false,
  subject: '공업 일반',
  subjectSlug: 'industry',
  units: 0,
  tags: 0,
  matched: 0,
  textbookOnly: 0,
  needsReview: 0,
  populatedFromStructured: 0,
  corrected: 0,
  missingTags: [],
  ambiguousTags: [],
  needsReviewTags: [],
};

for (let unit = 1; unit <= 20; unit += 1) {
  const frequency = read<Json>(
    path.join(TEXTBOOK, 'kongil_frequency', `${unit}단원.json`),
  );
  const cards =
    read<Json>(path.join(TEXTBOOK, 'kongil_cards_moi', `${unit}단원.json`))
      .concepts ?? [];
  const frequencyConcepts = frequency.concepts ?? [];
  const canonicalTags = read<Json>(
    path.join(
      TEXTBOOK,
      'concepts',
      'kongil',
      `Unit_${String(unit).padStart(2, '0')}.json`,
    ),
  ).concepts ?? [];
  const structured = read<Json>(
    path.join(TEXTBOOK, 'kongil_structured', `${unit}단원.json`),
  );
  const parsedFiles = ['all', 'moi_by_unit']
    .map((kind) =>
      path.join(TEXTBOOK, 'parsed', 'kongil', kind, `${unit}단원.json`),
    )
    .filter(fs.existsSync);
  const parsed = parsedFiles.flatMap((file) => read<Json[]>(file));
  report.units += 1;

  for (const [index, rawTag] of canonicalTags.entries()) {
    const tag = String(rawTag || '').trim();
    const cardMatches = cards.filter(
      (item: Json) => normalize(cardBody(item).name) === normalize(tag),
    );
    const frequencyMatches = frequencyConcepts.filter(
      (item: Json) => normalize(item.name) === normalize(tag),
    );
    const source =
      cardMatches.length === 1
        ? cards[cards.indexOf(cardMatches[0])]
        : frequencyMatches.length === 1
          ? frequencyMatches[0]
          : null;
    const structuredSource = source ? null : structuredMatch(tag, structured);
    const studyRebuildSource =
      source || structuredSource ? null : studyRebuildMatch(tag, unit, STUDY_REBUILD_DIR);
    const question = parsedQuestion(tag, parsed);
    const result = buildCard(
      unit,
      frequency.unitTitle || '공업 일반',
      tag,
      index + 1,
      source,
      structuredSource,
      question,
      studyRebuildSource,
    );
    tags.push(result);
    report.tags += 1;
    if (source) report.matched += 1;
    else if (structuredSource) report.textbookOnly += 1;
    else if (studyRebuildSource) report.populatedFromStructured += 1;
    else {
      report.needsReview += 1;
      report.needsReviewTags.push(`${unit}단원: ${tag}`);
    }
    if (cardMatches.length > 1 || frequencyMatches.length > 1)
      report.ambiguousTags.push(`${unit}단원: ${tag}`);
    if (tag !== String(frequencyConcepts[index]?.name ?? '').trim()) report.corrected += 1;
  }
}

if (
  tags.length !== report.tags ||
  report.units !== 20 ||
  new Set(tags.map((tag) => `${tag.unit}:${tag.name}`)).size !== tags.length
) {
  throw new Error('industry offline generator accounting failed');
}

fs.mkdirSync(OUTPUT, { recursive: true });
fs.writeFileSync(
  path.join(OUTPUT, 'all-concept-tags-offline.json'),
  `${JSON.stringify(tags, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(OUTPUT, 'all-concept-tags-offline-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
