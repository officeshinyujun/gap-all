const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const STUDY_ROOT = path.join(ROOT, 'textbook', '_v2', 'study-rebuild');
const SOURCE_FOLDERS = { success: 'success_cards_moi', industry: 'kongil_cards_moi' };
const SUBJECTS = ['success', 'industry'];
const FINDING_TYPES = [
  'canonical_name_mismatch',
  'missing_or_invalid_body',
  'keyPoints_non_string',
  'missing_or_invalid_question',
  'question_concept_or_source_mismatch',
  'missing_or_invalid_conceptHighlightV2',
  'ungrounded_quote',
  'ox_answer_mismatch',
  'suspicious_cross_concept_content',
];

const normalize = (value) => String(value ?? '')
  .toLowerCase()
  .replace(/[\s·()（）\[\]{}<>\-_/,:：.;!?~]+/gu, '');

const text = (value) => typeof value === 'string' ? value.trim() : '';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function questionData(card) {
  return card.sampleQuestion || card.realQuestion?.questionData || null;
}

function questionStem(question) {
  return text(question?.stem || question?.render_ready?.question_stem);
}

function questionStimulus(question) {
  const value = question?.stimulus || question?.render_ready?.stimulus_data;
  if (typeof value === 'string') return value;
  if (typeof value?.content === 'string') return value.content;
  if (Array.isArray(value?.paragraphs)) return value.paragraphs.map((item) => text(item?.content || item?.text || item)).join('\n');
  if (Array.isArray(value?.messages)) return value.messages.map((item) => text(item?.text)).join('\n');
  if (Array.isArray(value?.rows)) return [value.headers, ...value.rows].flat().map(text).filter(Boolean).join(' | ');
  return '';
}

function questionOptions(question) {
  return question?.options || question?.choices || question?.render_ready?.options_list || [];
}

function answerNumber(value) {
  if (Number.isInteger(value)) return value;
  if (typeof value !== 'string') return null;
  const symbols = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
  if (symbols[value]) return symbols[value];
  const match = value.match(/[1-5]/u);
  return match ? Number(match[0]) : null;
}

function sourceCards(subject, unit) {
  const file = path.join(ROOT, 'textbook', SOURCE_FOLDERS[subject], `${unit}단원.json`);
  if (!fs.existsSync(file)) return [];
  return readJson(file).concepts || [];
}

function findSourceCard(subject, unit, name) {
  const target = normalize(name);
  const cards = sourceCards(subject, unit);
  const direct = cards.find((item) => {
    const names = [item.name, item.card?.name, item.canonicalName].filter(Boolean).map(normalize);
    return names.includes(target) || names.some((candidate) => candidate && (candidate.startsWith(target) || target.startsWith(candidate)));
  });
  if (direct) return direct;
  const targetTokens = new Set(String(name ?? '').match(/[가-힣A-Za-z0-9]{2,}/gu) || []);
  return cards.map((item) => {
    const candidateTokens = new Set(String(item.name ?? '').match(/[가-힣A-Za-z0-9]{2,}/gu) || []);
    const overlap = [...targetTokens].filter((token) => candidateTokens.has(token));
    return { item, overlap, score: overlap.length / Math.max(targetTokens.size, candidateTokens.size, 1) };
  }).filter((candidate) => candidate.overlap.length >= 2)
    .sort((left, right) => right.score - left.score || right.overlap.length - left.overlap.length)[0]?.item || null;
}

function conceptMismatch(cardName, question) {
  const target = normalize(cardName);
  if (!target || !question) return null;
  const explicit = [question.targetConcept, question.target_concept, question.metadata?.target_concept]
    .find((value) => typeof value === 'string' && text(value));
  if (explicit && normalize(explicit) !== target && !normalize(explicit).includes(target) && !target.includes(normalize(explicit))) {
    return { kind: 'explicit', expected: cardName, actual: explicit };
  }
  return null;
}

function sourceMismatch(question, sourceCard) {
  if (!question || !sourceCard) return null;
  const sourceQuestion = sourceCard.realQuestion?.questionData || sourceCard.realQuestion;
  const sourceStem = questionStem(sourceQuestion);
  const currentStem = questionStem(question);
  const sourceNumber = sourceQuestion?.number ?? sourceQuestion?.metadata?.question_number;
  const currentNumber = question?.number ?? question?.metadata?.question_number;
  const sourceExam = text(sourceQuestion?.source_exam ?? sourceQuestion?.metadata?.source_exam);
  const currentExam = text(question?.source_exam ?? question?.metadata?.source_exam);
  if (sourceStem && currentStem && normalize(sourceStem) !== normalize(currentStem)
    && (sourceNumber !== undefined && currentNumber !== undefined && Number(sourceNumber) === Number(currentNumber))
    && sourceExam && currentExam && normalize(sourceExam) === normalize(currentExam)) {
    return { kind: 'source_identity', expected: { sourceExam, questionNumber: sourceNumber }, actual: { sourceExam: currentExam, questionNumber: currentNumber } };
  }
  return null;
}

function validHighlight(highlight) {
  return Boolean(highlight && typeof highlight === 'object' && !Array.isArray(highlight)
    && Array.isArray(highlight.stimulusClues)
    && Array.isArray(highlight.optionAnalysis)
    && Array.isArray(highlight.solvingFlow)
    && highlight.solvingFlow.length >= 3
    && text(highlight.takeaway));
}

function highlightIssues(highlight, question) {
  if (!highlight || typeof highlight !== 'object' || Array.isArray(highlight)) return ['missing_or_invalid_shape'];
  const issues = [];
  if (!Array.isArray(highlight.stimulusClues)) issues.push('stimulusClues');
  if (!Array.isArray(highlight.optionAnalysis)) issues.push('optionAnalysis');
  if (!Array.isArray(highlight.solvingFlow) || highlight.solvingFlow.length < 3) issues.push('solvingFlow');
  if (!text(highlight.takeaway)) issues.push('takeaway');
  return issues;
}

function auditHighlight(cardName, highlight, question, findings) {
  for (const issue of highlightIssues(highlight, question)) {
    findings.push({ type: 'missing_or_invalid_conceptHighlightV2', detail: issue });
  }
  if (!highlight || typeof highlight !== 'object') return;

  const stimulus = questionStimulus(question);
  for (const [index, clue] of (Array.isArray(highlight.stimulusClues) ? highlight.stimulusClues : []).entries()) {
    if (!text(clue?.quote) || (stimulus && !stimulus.includes(text(clue.quote)))) {
      findings.push({ type: 'ungrounded_quote', path: `stimulusClues[${index}].quote`, quote: clue?.quote ?? null });
    }
  }

  const options = questionOptions(question);
  const answer = answerNumber(question?.answer ?? question?.correct_answer ?? question?.correctAnswer);
  const analyses = Array.isArray(highlight.optionAnalysis) ? highlight.optionAnalysis : [];
  if (analyses.length && answer && options.length) {
    const stem = questionStem(question);
    const findWrong = /옳지 않은|적절하지 않은|적절하지 않는/u.test(stem);
    const correct = analyses.find((item) => Number(item.optionNum) === answer);
    const expectedCorrectVerdict = findWrong ? 'X' : 'O';
    if (correct && correct.verdict !== expectedCorrectVerdict) {
      findings.push({ type: 'ox_answer_mismatch', answer, optionNum: answer, expectedVerdict: expectedCorrectVerdict, actualVerdict: correct.verdict });
    }
    const numbered = analyses.filter((item) => Number.isInteger(item.optionNum));
    if (numbered.length === options.length) {
      const expectedO = findWrong ? options.length - 1 : 1;
      const actualO = numbered.filter((item) => item.verdict === 'O').length;
      if (actualO !== expectedO) findings.push({ type: 'ox_answer_mismatch', answer, expectedO, actualO });
    }
  }
}

function suspiciousCrossConcept(cardName, card, allCards) {
  const body = [card.description, card.conceptContent?.definition, card.conceptContent?.enrichedDefinition, card.conceptContent?.textbookExcerpt, ...(card.keyPoints || [])].filter((value) => typeof value === 'string').join(' ');
  const tokens = [...new Set(body.match(/[가-힣A-Za-z]{2,}/gu) || [])].filter((token) => normalize(token).length >= 2);
  return allCards
    .filter((other) => other !== card && normalize(other.name) !== normalize(cardName))
    .map((other) => {
      const otherTokens = new Set(normalize(other.name).match(/[가-힣A-Za-z]{2,}/gu) || []);
      const overlap = tokens.filter((token) => otherTokens.has(normalize(token)));
      return { other: other.name, overlap: [...new Set(overlap)] };
    })
    .filter((item) => item.overlap.length >= 2)
    .sort((left, right) => right.overlap.length - left.overlap.length)
    .slice(0, 3);
}

function main() {
  const findings = [];
  const files = [];
  const cards = [];
  for (const subject of SUBJECTS) {
    for (let unit = 1; unit <= 20; unit += 1) {
      const file = path.join(STUDY_ROOT, subject, `unit-${String(unit).padStart(2, '0')}.json`);
      files.push(path.relative(ROOT, file));
      const data = readJson(file);
      const unitCards = data.cards || [];
      for (const [index, card] of unitCards.entries()) cards.push({ subject, unit, index, card, canonical: data.canonicalTags?.[index] });
    }
  }

  for (const item of cards) {
    const { subject, unit, index, card, canonical } = item;
    const id = { subject, unit, card: card.name || canonical || `#${index + 1}`, file: `textbook/_v2/study-rebuild/${subject}/unit-${String(unit).padStart(2, '0')}.json` };
    const cardFindings = [];
    if (card.name !== canonical) cardFindings.push({ type: 'canonical_name_mismatch', expected: canonical ?? null, actual: card.name ?? null });
    const source = findSourceCard(subject, unit, canonical || card.name);
    const body = card.description ?? card.conceptContent?.definition;
    if (!text(body)) cardFindings.push({ type: 'missing_or_invalid_body' });
    if (!Array.isArray(card.keyPoints) || card.keyPoints.some((point) => typeof point !== 'string')) cardFindings.push({ type: 'keyPoints_non_string' });
    const question = questionData(card);
    if (!question || !questionStem(question) || !Array.isArray(questionOptions(question)) || questionOptions(question).length < 2 || !answerNumber(question.answer ?? question.correct_answer ?? question.correctAnswer)) {
      cardFindings.push({ type: 'missing_or_invalid_question' });
    } else {
      const mismatch = conceptMismatch(canonical || card.name, question) || sourceMismatch(question, source);
      if (mismatch) cardFindings.push({ type: 'question_concept_or_source_mismatch', ...mismatch });
    }
    const highlight = card.sampleQuestion?.conceptHighlightV2
      || card.realQuestion?.conceptHighlightV2
      || null;
    auditHighlight(canonical || card.name, highlight, question, cardFindings);
    const crossConcept = suspiciousCrossConcept(canonical || card.name, card, cards.map((entry) => entry.card));
    if (crossConcept.length) cardFindings.push({ type: 'suspicious_cross_concept_content', matches: crossConcept });
    if (cardFindings.length) findings.push({ ...id, findings: cardFindings });
  }

  const counts = Object.fromEntries(FINDING_TYPES.map((type) => [type, findings.reduce((count, item) => count + item.findings.filter((finding) => finding.type === type).length, 0)]));
  process.stdout.write(`${JSON.stringify({ readOnly: true, cards: cards.length, files, findingCounts: counts, findings }, null, 2)}\n`);
}

main();
