/** Build subject-separated study cards from checked-in textbook data only. */
import * as fs from 'node:fs';
import * as path from 'node:path';

type Subject = 'success' | 'industry';
type Card = Record<string, any>;
type Status = 'matched' | 'textbook_only' | 'needs_review';

const ROOT = path.resolve(__dirname, '..', '..');
const TEXTBOOK = path.join(ROOT, 'textbook');
const SUBJECTS: Record<Subject, { folder: string; cards: string; frequency: string }> = {
  success: { folder: 'sungjik', cards: 'success_cards_moi', frequency: 'sungjik_frequency' },
  industry: { folder: 'kongil', cards: 'kongil_cards_moi', frequency: 'kongil_frequency' },
};
const HAREN = '하렌(Harren)의 진로 의사 결정 유형';
const HAREN_DETAIL = '## 개념 정의\n하렌(Harren)의 진로 의사 결정 유형은 합리적, 직관적, 의존적 유형으로 구분된다.\n\n## 핵심 내용\n- 합리적 유형: 정보를 수집·분석하여 논리적으로 신중하게 결정한다.\n- 직관적 유형: 자신의 느낌과 직관을 중시하여 빠르게 결정한다.\n- 의존적 유형: 타인의 기대와 조언에 따라 결정하고 결과의 책임을 타인에게 돌리기 쉽다.\n\n| 유형 | 특징 |\n| --- | --- |\n| 합리적 | 정보 수집·분석, 신중한 결정 |\n| 직관적 | 느낌·직관 중시, 빠른 결정 |\n| 의존적 | 타인의 기대·조언에 의존 |\n\n## 시험 출제 포인트\n- 사례의 정보 수집·논리성은 합리적, 순간적인 느낌은 직관적, 타인의 결정에 따름은 의존적 유형이다.';

function readJson<T>(file: string): T { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; }
function normalize(value: unknown): string { return String(value ?? '').toLowerCase().replace(/[\s·()（）\-_/.,，:：]+/gu, ''); }
function body(card: Card): Card { return card.card && typeof card.card === 'object' ? { ...card, ...card.card } : card; }
function unitFiles(dir: string): number[] {
  return fs.readdirSync(dir).map((file) => Number(file.match(/^(\d+)단원\.json$/u)?.[1])).filter(Number.isInteger).sort((a, b) => a - b);
}
function load(subject: Subject, unit: number) {
  const meta = SUBJECTS[subject];
  const tags = readJson<{ concepts: string[] }>(path.join(TEXTBOOK, 'concepts', meta.folder, `Unit_${String(unit).padStart(2, '0')}.json`)).concepts;
  const cards = readJson<{ concepts: Card[] }>(path.join(TEXTBOOK, meta.cards, `${unit}단원.json`)).concepts;
  const frequency = readJson<{ concepts: Card[] }>(path.join(TEXTBOOK, meta.frequency, `${unit}단원.json`)).concepts;
  const structured = readJson<Card>(path.join(TEXTBOOK, `${meta.folder}_structured`, `${unit}단원.json`));
  return { tags, cards, frequency, structured };
}

function structuredMatch(tag: string, unit: Card): Card | null {
  const needle = normalize(tag);
  const candidates = (unit.sections ?? []).flatMap((section: Card) => (section.subsections ?? []).map((subsection: Card) => ({ section, subsection })))
    .map(({ section, subsection }: Card) => ({ section, subsection, text: normalize(`${section.title} ${subsection.title} ${subsection.explanation ?? ''}`) }))
    .filter(({ text }: Card) => text.includes(needle) || needle.includes(text));
  if (candidates.length !== 1) return null;
  const { section, subsection } = candidates[0];
  const points = Array.isArray(subsection.keyPoints) ? subsection.keyPoints : [];
  const exams = Array.isArray(subsection.examPoints) ? subsection.examPoints : [];
  const excerpt = [`## 개념 정의\n${subsection.explanation || section.summary || ''}`, points.length ? `## 핵심 포인트\n${points.map((p: string) => `- ${p}`).join('\n')}` : '', subsection.table ? `## 비교·정리\n${subsection.table}` : '', exams.length ? `## 시험 출제 포인트\n${exams.map((p: string) => `- ${p}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
  return { definition: subsection.explanation || section.summary || '', enrichedDefinition: subsection.explanation || section.summary || '', keyPoints: points, examTips: exams, textbookExcerpt: excerpt, sources: [], frequency: 0, realQuestion: null, _offlineSource: 'textbook_section' };
}

function makeCard(subject: Subject, unit: number, tag: string, rank: number, source: Card | undefined, structured: Card | null, used: number): Card {
  const item = body(source ?? structured ?? {});
  const isHarren = normalize(tag) === normalize(HAREN);
  const definition = isHarren ? HAREN_DETAIL : String(item.enrichedDefinition || item.definition || '');
  const points = isHarren ? HAREN_DETAIL.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2)) : (item.keyPoints ?? item.key_points ?? []);
  const excerpt = isHarren ? HAREN_DETAIL : String(item.textbookExcerpt || item.textbook_excerpt || item.conceptContent || '');
  const status: Status = isHarren ? 'needs_review' : source ? 'matched' : structured ? 'textbook_only' : 'needs_review';
  return {
    ...item, name: tag, rank, frequency: item.frequency ?? 0, sources: item.sources ?? [],
    description: definition, definition, enriched_definition: definition, enrichedDefinition: definition,
    keyPoints: points, key_points: points, examTips: item.examTips ?? item.exam_points ?? [],
    textbookExcerpt: excerpt, textbook_excerpt: excerpt, conceptContent: excerpt || definition,
    sampleQuestion: item.realQuestion ?? item.sampleQuestion ?? null, realQuestion: item.realQuestion ?? null,
    relatedQuestions: item.relatedQuestions ?? [], sourceTag: tag,
    contentStatus: status,
    _offline: { subject, unitNumber: unit, status, source: source ? 'textbook-frequency-and-cards' : structured ? 'textbook-structured' : 'needs-review', usedCardIndex: used },
  };
}

function repair(subject: Subject) {
  const meta = SUBJECTS[subject];
  const cards: Card[] = [];
  const report = { subject, units: 0, tags: 0, matched: 0, corrected: 0, textbookOnly: 0, needsReview: 0, missingTags: [] as string[], ambiguousTags: [] as string[], needsReviewTags: [] as string[] };
  for (const unit of unitFiles(path.join(TEXTBOOK, meta.cards))) {
    const data = load(subject, unit); report.units += 1;
    for (const [index, tag] of data.tags.entries()) {
      const matches = [...data.cards, ...data.frequency].map((card, cardIndex) => ({ card, cardIndex })).filter(({ card }) => normalize(body(card).name) === normalize(tag));
      const source = matches[0]?.card;
      const structured = source ? null : structuredMatch(tag, data.structured);
      const card = makeCard(subject, unit, tag, index + 1, source, structured, matches[0]?.cardIndex ?? -1);
      cards.push(card); report.tags += 1;
      if (source) report.matched += 1; else if (structured) report.textbookOnly += 1; else { report.needsReview += 1; report.needsReviewTags.push(`${unit}단원: ${tag}`); }
      if (normalize(tag) === normalize(HAREN)) report.corrected += 1;
    }
  }
  if (cards.length !== report.tags) throw new Error('offline repair accounting failed');
  const outDir = path.join(TEXTBOOK, '_v2', 'rebuild', subject); fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'all-concept-tags-offline.json'), `${JSON.stringify(cards, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'concept-tags-offline.json'), `${JSON.stringify(cards, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'concept-tags-offline-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const reports = (Object.keys(SUBJECTS) as Subject[]).map(repair);
console.log(JSON.stringify({ mode: 'offline', network: false, database: false, reports }, null, 2));
