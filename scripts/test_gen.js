const fs = require('fs');
const path = require('path');

const SUCCESS_DIR = path.resolve(__dirname, '../textbook/success_cards_moi');
const KONGIL_DIR = path.resolve(__dirname, '../textbook/kongil_cards_moi');

function readUnits(dir) {
  const files = fs.readdirSync(dir).filter(f => /^\d+단원\.json$/.test(f));
  return files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))).sort((a, b) => a.unit - b.unit);
}

function collectSentences(concept) {
  const sentences = [];
  const add = (text) => {
    if (!text || typeof text !== 'string') return;
    const parts = text.split(/[.。\n]/).map(s => s.trim()).filter(s => s.length > 10 && s.length < 200);
    sentences.push(...parts);
  };
  add(concept.card.definition);
  if (concept.card.keyPoints) concept.card.keyPoints.forEach(add);
  add(concept.card.enrichedDefinition);
  return sentences;
}

function extractTerms(sentence) {
  const candidates = [];
  const patterns = [
    /'([^']{2,15})'/g,
    /\*\*([^*]{2,15})\*\*/g,
    /([가-힣a-zA-Z0-9·]{2,12})\s*(은|는|이|가|을|를)\s+(?:의미|개념|특징|정의|종류|구분|요건|원칙|단계|요소|유형|방식|공정|관리|시스템)/g,
    /([가-힣a-zA-Z0-9·]{2,12})\s*(?:이다|라고 한다|에 해당한다|을\/를 의미한다)/g,
  ];
  for (const p of patterns) {
    for (const m of sentence.matchAll(p)) {
      const t = (m[1] || m[0]).trim();
      if (t && t.length >= 2 && t.length <= 20 && /[가-힣a-zA-Z]/.test(t)) candidates.push(t);
    }
  }
  return [...new Set(candidates)];
}

function getAllUnitTerms(unit) {
  const terms = new Set();
  for (const c of unit.concepts) {
    for (const s of collectSentences(c)) {
      for (const t of extractTerms(s)) terms.add(t);
    }
    terms.add(c.name);
  }
  return [...terms];
}

function pickDistractors(answer, unitTerms, count) {
  const pool = unitTerms.filter(t => t !== answer && t.length >= 2);
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return [...new Set(shuffled)].slice(0, count || 3);
}

function generateFromConcept(concept, unit, count) {
  const questions = [];
  const sentences = collectSentences(concept);
  const unitTerms = getAllUnitTerms(unit);
  const name = concept.name;
  const max = count || 2;

  for (const sentence of sentences) {
    if (questions.length >= max) break;
    const candidates = extractTerms(sentence);
    for (const term of candidates) {
      if (questions.length >= max) break;
      if (term === name) continue;
      if (term.length < 2 || term.length > 20) continue;

      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      const matchCount = (sentence.match(regex) || []).length;
      if (matchCount !== 1) continue;

      const template = sentence.replace(regex, '[blank]');
      const distractors = pickDistractors(term, unitTerms);
      if (distractors.length < 3) continue;

      questions.push({
        sentence_template: template,
        correct_answer: term,
        options: [term, ...distractors],
        explanation: "'" + term + "'은/는 '" + name + "' 개념을 이해하는 데 핵심적인 용어이다."
      });
    }
  }
  return questions;
}

// Test
console.log("=== TEST: 성공 Unit 1 ===");
const sungjikUnits = readUnits(SUCCESS_DIR);
const u1 = sungjikUnits[0];
for (const c of u1.concepts) {
  console.log("\n-- " + c.name + " --");
  const qs = generateFromConcept(c, u1, 2);
  for (const q of qs) {
    console.log("  T: " + q.sentence_template.substring(0, 80));
    console.log("  A: " + q.correct_answer);
    console.log("  O: " + q.options.join(" | "));
  }
  if (qs.length === 0) console.log("  (no questions generated)");
}

console.log("\n=== TEST: 공업 Unit 1 ===");
const kongilUnits = readUnits(KONGIL_DIR);
const k1 = kongilUnits[0];
for (const c of k1.concepts) {
  console.log("\n-- " + c.name + " --");
  const qs = generateFromConcept(c, k1, 2);
  for (const q of qs) {
    console.log("  T: " + q.sentence_template.substring(0, 80));
    console.log("  A: " + q.correct_answer);
    console.log("  O: " + q.options.join(" | "));
  }
  if (qs.length === 0) console.log("  (no questions generated)");
}
