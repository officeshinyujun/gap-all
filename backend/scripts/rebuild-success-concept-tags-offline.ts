/** Build the success subject's concept tags from checked-in textbook data only. */
import * as fs from 'node:fs';
import * as path from 'node:path';

type Card = Record<string, any>;
type Status = 'matched' | 'textbook_only' | 'needs_review';

const ROOT = path.resolve(__dirname, '..', '..');
const TEXTBOOK = path.join(ROOT, 'textbook');
const OUTPUT = path.join(TEXTBOOK, '_v2', 'rebuild', 'success');
const HAREN = '하렌(Harren)의 진로 의사 결정 유형';
const HAREN_DETAIL = '하렌(Harren)의 진로 의사 결정 유형은 합리적, 직관적, 의존적 유형으로 구분된다.\n\n- 합리적 유형: 정보를 수집·분석하여 논리적으로 신중하게 결정한다.\n- 직관적 유형: 자신의 느낌과 직관을 중시하여 빠르게 결정한다.\n- 의존적 유형: 타인의 기대와 조언에 따라 결정하고 결과의 책임을 타인에게 돌리기 쉽다.';

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[\s·()（）\-_/.,，:：]+/gu, '');
}

function body(card: Card): Card {
  return card.card && typeof card.card === 'object' ? { ...card, ...card.card } : card;
}

function isHarrenContaminated(card: Card | undefined, tag: string): boolean {
  return Boolean(
    card &&
      normalize(tag) !== normalize(HAREN) &&
      /하렌|harren/iu.test(JSON.stringify(card)),
  );
}

function unitFiles(dir: string): number[] {
  return fs.readdirSync(dir)
    .map((file) => Number(file.match(/^(\d+)단원\.json$/u)?.[1]))
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

function readUnit(unit: number) {
  const file = (dir: string, name: string) => path.join(TEXTBOOK, dir, `${name}.json`);
  return {
    tags: readJson<{ concepts: string[] }>(file('concepts/sungjik', `Unit_${String(unit).padStart(2, '0')}`)).concepts,
    cards: readJson<{ concepts: Card[] }>(file('success_cards_moi', `${unit}단원`)).concepts,
    frequency: readJson<{ concepts: Card[] }>(file('sungjik_frequency', `${unit}단원`)).concepts,
    structured: readJson<Card>(file('sungjik_structured', `${unit}단원`)),
    summation: fs.existsSync(file('sungjik_summation_v2', `${unit}단원`))
      ? readJson<Card>(file('sungjik_summation_v2', `${unit}단원`)) : null,
    parsed: fs.existsSync(file('parsed/sungjik/moi_by_unit', `${unit}단원`))
      ? readJson<Card>(file('parsed/sungjik/moi_by_unit', `${unit}단원`)) : null,
  };
}

function structuredMatch(tag: string, unit: Card): Card | null {
  const needle = normalize(tag);
  const candidates = (unit.sections ?? [])
    .flatMap((section: Card) => (section.subsections ?? []).map((subsection: Card) => ({ section, subsection })))
    .map(({ section, subsection }: Card) => ({ section, subsection, text: normalize(`${section.title} ${subsection.title} ${subsection.explanation ?? ''}`) }))
    .filter(({ text }: Card) => text.includes(needle) || needle.includes(text));
  if (candidates.length !== 1) return null;
  const { section, subsection } = candidates[0];
  const points = Array.isArray(subsection.keyPoints) ? subsection.keyPoints : [];
  const exams = Array.isArray(subsection.examPoints) ? subsection.examPoints : [];
  const excerpt = [`## 개념 정의\n${subsection.explanation || section.summary || ''}`, points.length ? `## 핵심 포인트\n${points.map((p: string) => `- ${p}`).join('\n')}` : '', subsection.table ? `## 비교·정리\n${subsection.table}` : '', exams.length ? `## 시험 출제 포인트\n${exams.map((p: string) => `- ${p}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
  return { definition: subsection.explanation || section.summary || '', keyPoints: points, examTips: exams, textbookExcerpt: excerpt, sources: [], frequency: 0, realQuestion: null, _offlineSource: 'textbook_section' };
}

function summationMatch(tag: string, summation: Card | null): Card | null {
  const matches = (summation?.cards ?? []).flatMap((card: Card) => card.content?.key_concepts ?? [])
    .filter((concept: Card) => normalize(concept.name) === normalize(tag));
  if (matches.length !== 1) return null;
  const concept = matches[0];
  return { definition: concept.definition ?? '', keyPoints: concept.key_points ?? [], examTips: [], textbookExcerpt: '', sources: [], frequency: 0, realQuestion: null, _offlineSource: 'textbook_summation' };
}

function makeCard(unit: number, tag: string, rank: number, source: Card | undefined, structured: Card | null, summation: Card | null): Card {
  const item = body(source ?? structured ?? summation ?? {});
  const isHarren = normalize(tag) === normalize(HAREN);
  const definition = isHarren ? HAREN_DETAIL : String(item.enrichedDefinition || item.definition || item.description || '');
  const points = isHarren ? HAREN_DETAIL.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2)) : (item.keyPoints ?? item.key_points ?? []);
  const status: Status = isHarren ? 'needs_review' : source ? 'matched' : structured || summation ? 'textbook_only' : 'needs_review';
  return {
    ...item, name: tag, rank, frequency: item.frequency ?? 0, sources: item.sources ?? [], description: definition,
    definition, enriched_definition: definition, enrichedDefinition: definition, keyPoints: points, key_points: points,
    examTips: item.examTips ?? item.exam_points ?? [], textbookExcerpt: isHarren ? HAREN_DETAIL : item.textbookExcerpt ?? item.textbook_excerpt ?? '',
    textbook_excerpt: isHarren ? HAREN_DETAIL : item.textbookExcerpt ?? item.textbook_excerpt ?? '', conceptContent: isHarren ? HAREN_DETAIL : item.conceptContent ?? definition,
    sampleQuestion: item.realQuestion ?? item.sampleQuestion ?? null, realQuestion: item.realQuestion ?? null,
    relatedQuestions: item.relatedQuestions ?? [], sourceTag: tag, contentStatus: status,
    _offline: { subject: 'success', unitNumber: unit, status, source: source ? 'textbook-frequency-and-cards' : structured ? 'textbook-structured' : summation ? 'textbook-summation' : 'needs-review' },
  };
}

function main() {
  const report = { subject: 'success', units: 0, canonicalTags: 0, generated: 0, matched: 0, textbookOnly: 0, needsReview: 0, corrected: 0, excludedContamination: 0, needsReviewTags: [] as string[] };
  const cards: Card[] = [];
  for (const unit of unitFiles(path.join(TEXTBOOK, 'success_cards_moi'))) {
    const data = readUnit(unit); report.units += 1;
    for (const [index, tag] of data.tags.entries()) {
      const matches = [...data.cards, ...data.frequency].map((card, cardIndex) => ({ card, cardIndex }))
        .filter(({ card }) => normalize(body(card).name) === normalize(tag));
      const contaminated = isHarrenContaminated(matches[0]?.card, tag);
      const source = contaminated ? undefined : matches[0]?.card;
      const structured = source ? null : structuredMatch(tag, data.structured);
      const summation = source || structured ? null : summationMatch(tag, data.summation);
      const card = makeCard(unit, tag, index + 1, source, structured, summation);
      cards.push(card); report.canonicalTags += 1; report.generated += 1;
      if (source) report.matched += 1; else if (structured || summation) report.textbookOnly += 1; else { report.needsReview += 1; report.needsReviewTags.push(`${unit}단원: ${tag}`); }
      if (contaminated) report.excludedContamination += 1;
      if (normalize(tag) === normalize(HAREN)) report.corrected += 1;
    }
  }
  if (report.units !== 20 || cards.length !== report.canonicalTags) throw new Error('success offline accounting failed');
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, 'all-concept-tags-offline.json'), `${JSON.stringify(cards, null, 2)}\n`);
  fs.writeFileSync(path.join(OUTPUT, 'concept-tags-offline.json'), `${JSON.stringify(cards, null, 2)}\n`);
  fs.writeFileSync(path.join(OUTPUT, 'all-concept-tags-offline-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ mode: 'offline', network: false, database: false, report }, null, 2));
}

main();
