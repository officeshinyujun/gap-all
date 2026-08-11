const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const TEXTBOOK = path.join(ROOT, 'textbook');
const OUTPUTS = [
  ['success', 'sungjik', 'success_cards_moi', [1, 10]],
  ['success', 'sungjik', 'success_cards_moi', [11, 20]],
  ['industry', 'kongil', 'kongil_cards_moi', [1, 10]],
  ['industry', 'kongil', 'kongil_cards_moi', [11, 20]],
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[\s·()（）\-_/,:：]+/gu, '');
}

function tokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[()（）/·,，:：\-_/]+/gu, ' ')
    .split(/\s+/u)
    .filter((token) => token.length >= 2);
}

function sameToken(left, right) {
  return left === right || (left.length >= 2 && right.length >= 2 && (left.startsWith(right) || right.startsWith(left)));
}

function matchTag(tag, cards, usedCards) {
  const available = cards.filter((item) => !usedCards.has(item));
  const exact = available.filter((item) => normalize(item.name) === normalize(tag));
  if (exact.length === 1) return { item: exact[0], method: 'exact' };

  const tagTokens = [...new Set(tokens(tag))];
  const candidates = available
    .map((item) => {
      const cardTokens = [...new Set(tokens(item.name))];
      const common = tagTokens.filter((token) => cardTokens.some((candidate) => sameToken(token, candidate)));
      const score = common.length / Math.max(tagTokens.length, 1);
      return { item, common, score, cardCoverage: common.length / Math.max(cardTokens.length, 1) };
    })
    .filter((candidate) => candidate.common.length >= 2 && candidate.score >= 0.5 && candidate.cardCoverage >= 0.5)
    .sort((a, b) => b.score - a.score || b.cardCoverage - a.cardCoverage);

  if (candidates.length === 1 || (candidates[0] && candidates[0].score > candidates[1].score)) {
    return { item: candidates[0].item, method: 'token' };
  }
  return null;
}

function structuredEvidence(structured, tag) {
  const tagTokens = [...new Set(tokens(tag))];
  const sections = (structured.sections || []).flatMap((section) => [section, ...(section.subsections || [])]);
  return sections.flatMap((section) => {
    const titleTokens = [...new Set(tokens(section.title))];
    const common = tagTokens.filter((token) => titleTokens.some((candidate) => sameToken(token, candidate)));
    return common.length >= 2 ? [{ ...section }] : [];
  });
}

function rawEvidence(raw, tag) {
  const tagTokens = [...new Set(tokens(tag))];
  const lines = raw.split(/\r?\n/u);
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    const window = lines.slice(Math.max(0, i - 1), i + 2).join('\n');
    const matched = tagTokens.filter((token) => normalize(window).includes(normalize(token)));
    if (matched.length >= 2) hits.push({ lines: window, matchedTokens: matched });
  }
  return hits.filter((hit, index) => index === 0 || hit.lines !== hits[index - 1].lines).slice(0, 3);
}

function buildCard(tag, rank, source, structured, raw, sourcePath) {
  const errors = [];
  const card = source && source.card;
  if (!card) errors.push('missing source card');
  if (!card?.definition && !card?.enrichedDefinition) errors.push('missing source definition');
  if (!Array.isArray(card?.keyPoints) || card.keyPoints.length === 0) errors.push('missing source keyPoints');
  if (!card?.textbookExcerpt && !card?.enrichedDefinition) errors.push('missing source excerpt');

  const structuredMatches = structuredEvidence(structured, tag);
  const rawMatches = rawEvidence(raw, tag);
  if (structuredMatches.length === 0 && rawMatches.length === 0) errors.push('missing matched structured/raw evidence');

  const realQuestion = source?.realQuestion?.questionData;
  if (!realQuestion || (!realQuestion.stem && !realQuestion.full_text)) errors.push('missing realQuestion');
  if (realQuestion && (realQuestion.answer === undefined || realQuestion.answer === null || realQuestion.answer === '')) {
    errors.push('realQuestion answer needs review');
  }

  // ponytail: conservative fallback; missing evidence stays needs_review instead of becoming invented prose.
  const clean = errors.length === 0;
  return {
    name: tag,
    rank,
    description: card?.definition || null,
    keyPoints: Array.isArray(card?.keyPoints) ? card.keyPoints : [],
    examTips: [],
    subtopics: [],
    conceptContent: {
      definition: card?.definition || null,
      enrichedDefinition: card?.enrichedDefinition || null,
      textbookExcerpt: card?.textbookExcerpt || null,
      structuredEvidence: structuredMatches,
      rawEvidence: rawMatches,
    },
    sampleQuestion: realQuestion || null,
    relatedQuestions: [],
    problemApplication: realQuestion ? source.conceptUsage || null : null,
    sourceEvidence: { sourceCard: sourcePath, structured: structuredMatches.length, raw: rawMatches.length },
    contentStatus: clean ? 'complete' : 'needs_review',
    validationErrors: errors,
  };
}

function buildArtifact(subject, sourceFolder, cardsFolder, range) {
  const units = [];
  for (let unit = range[0]; unit <= range[1]; unit += 1) {
    const unitFile = `Unit_${String(unit).padStart(2, '0')}.json`;
    const conceptPath = path.join(TEXTBOOK, 'concepts', sourceFolder, unitFile);
    const conceptData = readJson(conceptPath);
    const cardPath = path.join(TEXTBOOK, cardsFolder, `${unit}단원.json`);
    const cardData = readJson(cardPath);
    const structuredPath = path.join(TEXTBOOK, `${sourceFolder}_structured`, `${unit}단원.json`);
    const rawPath = path.join(TEXTBOOK, sourceFolder, `Unit_${String(unit).padStart(2, '0')}.txt`);
    const structured = fs.existsSync(structuredPath) ? readJson(structuredPath) : {};
    const raw = fs.existsSync(rawPath) ? fs.readFileSync(rawPath, 'utf8') : '';
    const cards = (cardData.concepts || []).filter((item) => item && item.name);
    const usedCards = new Set();
    const outputCards = conceptData.concepts.map((tag, index) => {
      const match = matchTag(tag, cards, usedCards);
      if (match) usedCards.add(match.item);
      return buildCard(tag, index + 1, match?.item, structured, raw, match ? cardPath : null);
    });
    units.push({ unit, unitName: conceptData.unitName, canonicalTags: conceptData.concepts, tagCount: conceptData.concepts.length, cards: outputCards });
  }
  return { artifact: `${subject}-study-rebuild`, version: 3, subject, subjectSource: sourceFolder, unitRange: range, units };
}

function validateArtifact(artifact) {
  const errors = [];
  if (!artifact || !Array.isArray(artifact.units) || artifact.units.length !== 10) errors.push('expected 10 units');
  for (const unit of artifact?.units || []) {
    if (!Array.isArray(unit.canonicalTags) || !Array.isArray(unit.cards) || unit.cards.length !== unit.canonicalTags.length) {
      errors.push(`unit ${unit.unit}: tag/card count mismatch`);
    }
    for (const [index, card] of (unit.cards || []).entries()) {
      if (card.name !== unit.canonicalTags[index] || !['complete', 'needs_review'].includes(card.contentStatus) || !Array.isArray(card.validationErrors)) {
        errors.push(`unit ${unit.unit} card ${index + 1}: invalid card shape`);
      }
    }
  }
  return errors;
}

function outputPath(subject, range) {
  return path.join(TEXTBOOK, '_v2', 'study-rebuild', subject, `all-units-${String(range[0]).padStart(2, '0')}-${String(range[1]).padStart(2, '0')}.json`);
}

function unitOutputPath(subject, unit) {
  return path.join(TEXTBOOK, '_v2', 'study-rebuild', subject, `unit-${String(unit.unit).padStart(2, '0')}.json`);
}

function qualityReport(artifacts) {
  return artifacts.flatMap(({ subject, artifact }) => artifact.units.map((unit) => {
    const cards = unit.cards || [];
    const reviewCards = cards.filter((card) => card.contentStatus === 'needs_review');
    const issues = reviewCards.flatMap((card) => card.validationErrors.map((error) => ({ card: card.name, error })));
    return {
      subject,
      unit: unit.unit,
      unitName: unit.unitName,
      tagCount: unit.canonicalTags.length,
      cardCount: cards.length,
      completeCards: cards.length - reviewCards.length,
      needsReviewCards: reviewCards.length,
      issues,
    };
  }));
}

function run(validateOnly) {
  const artifacts = validateOnly
    ? OUTPUTS.map(([subject, , , range]) => ({ subject, range, artifact: readJson(outputPath(subject, range)) }))
    : OUTPUTS.map(([subject, sourceFolder, cardsFolder, range]) => ({ subject, range, artifact: buildArtifact(subject, sourceFolder, cardsFolder, range) }));
  const hardErrors = artifacts.flatMap(({ subject, artifact }) => validateArtifact(artifact).map((error) => `${subject}: ${error}`));
  if (validateOnly) {
    const cards = artifacts.flatMap(({ artifact }) => artifact.units.flatMap((unit) => unit.cards));
    const needsReview = cards.filter((card) => card.contentStatus === 'needs_review').length;
    console.log(JSON.stringify({ cleanCards: cards.length - needsReview, needsReviewCards: needsReview, hardValidationErrors: hardErrors.length, errors: hardErrors }, null, 2));
    process.exitCode = hardErrors.length ? 1 : 0;
    return;
  }
  if (hardErrors.length) throw new Error(hardErrors.join('\n'));
  const staged = artifacts.map(({ subject, range, artifact }) => {
    const target = outputPath(subject, range);
    const temp = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(temp, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    JSON.parse(fs.readFileSync(temp, 'utf8'));
    return [temp, target];
  });
  const splitStaged = artifacts.flatMap(({ subject, artifact }) => artifact.units.map((unit) => {
    const target = unitOutputPath(subject, unit);
    const temp = `${target}.tmp-${process.pid}`;
    fs.writeFileSync(temp, `${JSON.stringify({
      artifact: `${subject}-study-rebuild`,
      version: artifact.version,
      subject,
      subjectSource: artifact.subjectSource,
      unitRange: [unit.unit, unit.unit],
      ...unit,
    }, null, 2)}\n`, 'utf8');
    JSON.parse(fs.readFileSync(temp, 'utf8'));
    return [temp, target];
  }));
  const reportTargets = [...new Set(artifacts.map(({ subject }) => path.join(TEXTBOOK, '_v2', 'study-rebuild', subject, 'quality-report.json')))];
  const reportStaged = reportTargets.map((target) => {
    const temp = `${target}.tmp-${process.pid}`;
    const subject = path.basename(path.dirname(target));
    const report = qualityReport(artifacts.filter(({ subject: itemSubject }) => itemSubject === subject));
    fs.writeFileSync(temp, `${JSON.stringify({ subject, generatedAt: new Date().toISOString(), units: report }, null, 2)}\n`, 'utf8');
    JSON.parse(fs.readFileSync(temp, 'utf8'));
    return [temp, target];
  });
  for (const [temp, target] of [...staged, ...splitStaged, ...reportStaged]) fs.renameSync(temp, target);
  console.log(JSON.stringify({
    files: [...staged, ...splitStaged, ...reportStaged].map(([, target]) => target),
    hardValidationErrors: 0,
    quality: qualityReport(artifacts).reduce((summary, unit) => ({
      cards: summary.cards + unit.cardCount,
      completeCards: summary.completeCards + unit.completeCards,
      needsReviewCards: summary.needsReviewCards + unit.needsReviewCards,
    }), { cards: 0, completeCards: 0, needsReviewCards: 0 }),
  }, null, 2));
}

run(process.argv.includes('--validate'));
