// Regenerate ALL blank questions deterministically from concept keyPoints.
// Quality-first: definition-style questions from colon patterns, and
// key-term blanks from full-sentence keyPoints. Options are sibling terms
// from the same unit. Explanations are the complete keyPoint + concept definition.
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const MAP = { success_cards_moi: 'sungjik', kongil_cards_moi: 'kongil' };

// ---- Korean particle helpers ----
function hasJongseong(word) {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
}
function josa(word, form) {
  // form: '은/는' '이/가' '을/를' '으로/로' '과/와'
  const jong = hasJongseong(word);
  const [a, b] = form.split('/');
  return jong ? a : b;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Extract the term before ':' in a colon-pattern keyPoint
function termBeforeColon(kp) {
  const m = kp.match(/^(.{1,30}?)[:：]\s/);
  if (!m) return null;
  let term = m[1].trim();
  // strip trailing particles or decorations
  term = term.replace(/^[\-\s]+$/, '');
  return term;
}

// A good blank term: a noun-ish concept word, no digits/symbols, no verb endings
function isGoodTerm(t: string): boolean {
  if (t.length < 2 || t.length > 14) return false;
  if (/[0-9~,.,%，()()]/.test(t)) return false;
  // reject verb/adjective endings and sentence particles
  if (/(하다|한다|하는|되었다|되며|되어|되고|되고,|있으며|있고|이며|이며,|이라|라고|가능한|가능하게|가능하다|구성되어|구성한다|이라고|이란|구분된다|분류된다|해당하며|가공하여|가공해서|나뉘며|나뉜다|된다\.|한다\.)$/.test(t)) return false;
  // reject copula/existential verbs and pure predicates
  if (/(있다|없다|이다|이다\.|한다\.|된다\.|됨\.|있음|있을|없을|같다|같은|라는|이는|가는)$/.test(t) && t.length <= 4) return false;
  // reject common attributive adjective forms
  if (/(특별한|중요한|다양한|새로운|큰|작은|많은|좋은|필요한|이러한|그러한|높은|낮은|같은|다른|어떤|모든|한)$/.test(t)) return false;
  return true;
}

// Strip ONE trailing Korean particle (은/는/이/가/을/를/과/와/으로/로/에/에서/의/도/만/까지/부터/나/이나)
// Longest particle first; keep at least 2 chars of the stem.
const PARTICLES = ['으로서', '으로는', '에서는', '에게는', '에게도', '에는', '에서', '에게', '부터', '까지', '이나', '들은', '이라', '라는', '으로', '로는', '으로도', '에서도', '은', '는', '이', '가', '을', '를', '과', '와', '에', '의', '도', '만', '나', '로', '로서'].sort((a, b) => b.length - a.length);
function stripParticles(word: string): string {
  for (const p of PARTICLES) {
    if (word.length - p.length >= 2 && word.endsWith(p)) {
      return word.slice(0, -p.length);
    }
  }
  return word;
}

// Extract candidate terms from a full sentence (multi-char words, no particles)
function extractTerms(sentence: string, unitTerms: string[]): string[] {
  const candidates: string[] = [];
  // quoted terms first
  const q = sentence.match(/[''']([^''']{2,15})[''']/g) || [];
  for (const m of q) candidates.push(m.replace(/[''']/g, ''));
  // terms from unit pool that literally appear in the sentence
  for (const t of unitTerms) {
    if (t.length >= 2 && sentence.includes(t) && !candidates.includes(t)) {
      candidates.push(t);
    }
  }
  // multi-char words (fallback) — filter out verbs/adverbs/function words
  const STOP = [
    '가능하게', '할', '한다', '하는', '이다', '이며', '이며,', '있으며',
    '통해', '따라', '위해', '때문에', '그리고', '또한', '가지는', '지닌다',
    '구분된', '구분되며', '나뉘며', '포함하고', '포함된다', '포함하는',
    '이루어지', '발생한다', '발생하는', '가지고', '가지며', '실천하',
    '수행한다', '수행하', '제시되며', '강조한다', '작용한다', '기여하',
    '된다', '된다.', '있습니다', '있습니다.', '관련된', '중요한', '다양한',
    '개별적', '집단적', '이러한', '이에', '이는', '그는', '이것', '그것',
  ];
  const words = sentence
    .replace(/[.,，、;:;()()''""]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP.includes(w) && !/^(이|그|저|것|위한|있는|하는|통해|따라|이는|그는|또한|그리고|및|와|과|은|는|이|가|을|를|의|에|에서|로|으로)$/.test(w));
  for (const w of words) {
    if (!candidates.includes(w)) candidates.push(w);
  }
  return candidates;
}

async function main() {
  const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Load all concepts
  const lookup = {};
  for (const [folder, subj] of Object.entries(MAP)) {
    const base = path.resolve('/Users/yjshin/projects/product/gap/textbook', folder);
    for (const file of fs.readdirSync(base).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
      const unit = parseInt(file.replace('단원.json', ''));
      const data = JSON.parse(fs.readFileSync(path.join(base, file), 'utf-8'));
      if (!lookup[subj]) lookup[subj] = {};
      lookup[subj][unit] = data.concepts || [];
    }
  }

  const allSubjects = ['sungjik', 'kongil'];
  let totalQuestions = 0;

  for (const subj of allSubjects) {
    for (let unit = 1; unit <= 20; unit++) {
      const concepts = lookup[subj]?.[unit];
      if (!concepts || !concepts.length) continue;

      // ---- Collect all keyPoints and unit term pool ----
      const keyPoints: { kp: string; concept: any }[] = [];
      const colonTerms: string[] = [];
      const conceptNames: string[] = [];
      for (const c of concepts) {
        conceptNames.push(c.name);
        const kps = (c.card?.keyPoints || c.keyPoints || []).map((k: any) => (typeof k === 'string' ? k : ''));
        for (const kp of kps) {
          if (!kp) continue;
          keyPoints.push({ kp, concept: c });
          const t = termBeforeColon(kp);
          if (t) colonTerms.push(t);
        }
      }

      // unit term pool = concept names + colon terms + quoted terms in keyPoints
      const unitTerms = [...new Set([...conceptNames, ...colonTerms])].filter((t) => t.length >= 2);

      // term frequency across all unit text — used to pick "important" blank terms
      // Count every meaningful word across all keyPoints, plus unit vocabulary.
      const allUnitText = keyPoints.map((k) => k.kp).join(' ');
      const termFreq = new Map<string, number>();
      const allUnitWords = extractTerms(allUnitText, unitTerms);
      for (const w of allUnitWords) {
        const stripped = stripParticles(w);
        if (stripped.length >= 2) {
          const count = allUnitText.split(stripped).length - 1;
          termFreq.set(stripped, count);
        }
      }

      // ---- Build questions ----
      const questions: any[] = [];
      const usedSentences = new Set<string>();
      const usedAnswers = new Set<string>();

      // 1. Definition-style questions from colon patterns
      for (const { kp, concept } of keyPoints) {
        if (questions.length >= 10) break;
        const term = termBeforeColon(kp);
        if (!term) continue;
        const desc = kp.slice(term.length).replace(/^[:：]\s*/, '').trim();
        if (desc.length < 8 || term.length < 2) continue;
        if (usedAnswers.has(term) || usedSentences.has(desc)) continue;

        // options: 3 other terms from the unit — prefer short colon terms over concept names
        const shortPool = unitTerms.filter((t) => t.length <= 12);
        const pool = shortPool.length >= 4 ? shortPool : unitTerms;
        const distractors = pool.filter((t) => t !== term && t.length >= 2).slice(0, 3);
        if (distractors.length < 3) continue;
        const options = [...distractors, term];
        // shuffle so answer isn't always last
        for (let i = options.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [options[i], options[j]] = [options[j], options[i]];
        }

        const explanation =
          `${term}${josa(term, '은/는')} ${desc.replace(/\.+$/, '')}. ` +
          `${concept.name}${josa(concept.name, '과/와')} 관련된 개념으로, ` +
          `${(concept.card?.definition || '').trim()}`;

        questions.push({
          sentence_template: `[blank]: ${desc}`,
          correct_answer: term,
          options,
          explanation,
        });
        usedSentences.add(desc);
        usedAnswers.add(term);
      }

      // 2. Sentence-blank questions from full keyPoints
      for (const { kp, concept } of keyPoints) {
        if (questions.length >= 10) break;
        if (termBeforeColon(kp)) continue; // already used colon ones
        if (kp.length < 15) continue;
        if (usedSentences.has(kp)) continue;

        // find a term to blank
        // priority: terms from the unit's real vocabulary (concept names, colon terms)
        // that appear in this sentence; prefer higher-frequency (more important) terms.
        // Note: pool terms are already clean — do NOT strip particles (would corrupt
        // nouns like "증가" -> "증").
        const poolTerms = unitTerms
          .filter((t) => isGoodTerm(t) && kp.replace(/\s/g, '').includes(t.replace(/\s/g, '')) && !usedAnswers.has(t));
        let blankTerm: string | null = null;
        if (poolTerms.length > 0) {
          // pick highest frequency first, then longest
          blankTerm = poolTerms.sort((a, b) => {
            const fa = termFreq.get(a) || 0;
            const fb = termFreq.get(b) || 0;
            if (fa !== fb) return fb - fa;
            return b.length - a.length;
          })[0];
        } else {
          // fallback: nouns from the sentence that are important unit vocabulary
          const fallbackTerms = extractTerms(kp, [])
            .map((t) => stripParticles(t))
            .filter((t) => isGoodTerm(t) && kp.replace(/\s/g, '').includes(t.replace(/\s/g, '')) && !usedAnswers.has(t) && (termFreq.get(t) || 0) >= 1);
          if (fallbackTerms.length > 0) {
            blankTerm = fallbackTerms.sort((a, b) => (termFreq.get(b) || 0) - (termFreq.get(a) || 0) || b.length - a.length)[0];
          }
        }
        if (!blankTerm) continue;

// Blank the first occurrence of `term` in `sentence`, tolerating spacing differences
// (e.g. pool term "생계 유지" vs sentence "생계유지"). Returns [newSentence, matched].
function blankFirstOccurrence(sentence: string, term: string): [string, string] | null {
  const normSentence = sentence.replace(/\s/g, '');
  const normTerm = term.replace(/\s/g, '');
  const idx = normSentence.indexOf(normTerm);
  if (idx < 0) return null;
  // find the actual span in the original sentence
  let start = 0;
  let chars = 0;
  for (let i = 0; i < sentence.length; i++) {
    if (sentence[i] === ' ') continue;
    if (chars === idx) { start = i; break; }
    chars++;
  }
  let end = start;
  let matchedChars = 0;
  for (let i = start; i < sentence.length; i++) {
    if (sentence[i] === ' ') continue;
    matchedChars++;
    end = i + 1;
    if (matchedChars === normTerm.length) break;
  }
  const matched = sentence.slice(start, end);
  return [sentence.slice(0, start) + '[blank]' + sentence.slice(end), matched];
}

        // blank only the first occurrence
        const blanked = blankFirstOccurrence(kp, blankTerm);
        if (!blanked) continue;
        const sentence = blanked[0];
        // options: prefer short terms so the answer isn't obvious; fall back to any unit terms
        const shortPool = unitTerms.filter((t) => t.length <= 12 && t !== blankTerm);
        const pool = shortPool.length >= 3 ? shortPool : unitTerms.filter((t) => t !== blankTerm);
        const distractors = pool.filter((t) => t.length >= 2).slice(0, 3);
        if (distractors.length < 3) continue;
        const options = [...distractors, blankTerm];
        for (let i = options.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [options[i], options[j]] = [options[j], options[i]];
        }

        const explanation =
          `${kp.replace(blankTerm, `'${blankTerm}'`).replace(/\.+$/, '')}. ` +
          `${concept.name}${josa(concept.name, '과/와')} 관련된 핵심 내용이다. ` +
          `${(concept.card?.definition || '').trim()}`;

        questions.push({
          sentence_template: sentence,
          correct_answer: blankTerm,
          options,
          explanation,
        });
        usedSentences.add(kp);
        usedAnswers.add(blankTerm);
      }

      if (questions.length === 0) {
        console.log(`  ⚠ ${subj}/${unit}: 0 questions`);
        continue;
      }

      // upsert into quiz_cache (count=10)
      const { error } = await s.from('quiz_cache').upsert(
        {
          subject: subj,
          unit_number: unit,
          cache_type: 'blank',
          quiz_count: 10,
          data: questions,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'subject,unit_number,cache_type,quiz_count' },
      );
      if (error) {
        console.log(`  ✗ ${subj}/${unit}: ${error.message}`);
        continue;
      }
      totalQuestions += questions.length;
      console.log(`  ✓ ${subj}/${unit}: ${questions.length}문항`);
    }
  }
  console.log(`\n총 ${totalQuestions}개`);
}
main().catch((e) => console.error(e));
