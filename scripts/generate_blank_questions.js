const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/yjshin/projects/product/gap/backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const BASE_DIRS = {
  sungjik: '/Users/yjshin/projects/product/gap/textbook/success_cards_moi',
  kongil: '/Users/yjshin/projects/product/gap/textbook/kongil_cards_moi',
};

function loadUnits(subject) {
  const dir = BASE_DIRS[subject];
  const files = fs.readdirSync(dir).filter(f => /^\d+단원\.json$/.test(f));
  return files
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => a.unit - b.unit);
}

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\|.*?\|/g, '')
    .replace(/[-*]\s/g, '')
    .replace(/^\s*[-–—•]\s*/gm, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, '')
    .replace(/>\s*💡.*$/, '')
    .trim();
}

function splitSentences(text) {
  return text
    .split(/[.!?。！？\n](?=\s|$)/)
    .map(s => s.trim())
    .filter(s => s.length > 15);
}

// Filter out non-meaningful fragments that shouldn't be vocabulary
const MEANINGLESS_PATTERNS = [
  /^[가-힣]{1,2}$/,
  /등을\s*포함/,
  /것을\s*의미/,
  /나뉘(며|고|는|ㄴ다)/,
  /구분하고/,
  /말하며/,
  /포함한다/,
  /구성된/,
  /설명하는/,
  /적용하는/,
  /가지는/,
  /의미한다/,
  /제공한다/,
  /나타낸다/,
  /중요하다/,
  /가능하다/,
  /이루어진/,
  /필요하다/,
  /판단하는/,
  /확인하는/,
  /해당하는/,
  /추구하며/,
  /기여한다/,
  /형성한다/,
  /해결함/,
  /작용함/,
  /위한$/,
  /위해$/,
  /통한$/,
  /통해$/,
  /의한$/,
  /으로$/,
  /으로서$/,
  /으로써$/,
  /에서$/,
  /에게$/,
  /보다$/,
  /부터$/,
  /까지$/,
  /정도$/,
  /한다는$/,
  /하는$/,
  /하는데$/,
  /말한다$/,
  /의미와$/,
  /개념과$/,
  /특징과$/,
  /분류와$/,
];

function isMeaningfulTerm(term) {
  if (term.length < 2 || term.length > 18) return false;
  for (const pattern of MEANINGLESS_PATTERNS) {
    if (pattern.test(term)) return false;
  }
  // Must contain at least one meaningful noun character
  if (!/[가-힣]/.test(term)) return false;
  return true;
}

function extractKeyTerms(keyPoints) {
  // Extract specific key terms from keyPoints - these are the best vocabulary
  const terms = new Set();
  if (!keyPoints) return [...terms];

  const kpArray = Array.isArray(keyPoints) ? keyPoints : [keyPoints];

  kpArray.forEach(point => {
    if (typeof point !== 'string') return;
    const cleaned = stripMarkdown(point);

    // Extract parenthesized lists: "외재적 가치는 경제적 보상, 직업 안정 등을 포함"
    const parenMatch = cleaned.match(/\(([^)]+)\)/g);
    if (parenMatch) {
      parenMatch.forEach(pm => {
        const inner = pm.replace(/[()]/g, '');
        inner.split(/[,、·\/]/).forEach(t => {
          const tt = t.replace(/등$/, '').replace(/을$/, '').replace(/를$/, '').replace(/와$/, '').replace(/과$/, '').trim();
          if (isMeaningfulTerm(tt)) terms.add(tt);
        });
      });
    }

    // Extract "~는/은/이/가 X(이)다" patterns for key nouns
    const keyNounMatch = cleaned.match(/([가-힣a-zA-Z]+\s[가-힣a-zA-Z]+)(?:는|은|이란|란)\s/);
    if (keyNounMatch && isMeaningfulTerm(keyNounMatch[1])) {
      terms.add(keyNounMatch[1].trim());
    }

    // Extract terms that appear as "X형", "X식", "X법", "X제", "X적 Y"
    const compoundMatch = cleaned.match(/([가-힣a-zA-Z]{2,12}(?:형|식|법|제|업|기|자|관|론|설|화|성|산|원|비|력|도|률|율|권|책|급|금|세|소|수|지|처|장|체|단|군|종|류|계|선|면|점|층|파|계|문|학|술|칙|제|도|표|안|책|고|론|어|문|자|사|인|물|상|품|재|료))/g);
    if (compoundMatch) {
      compoundMatch.forEach(m => {
        if (isMeaningfulTerm(m)) terms.add(m);
      });
    }
  });

  return [...terms];
}

function extractQuotedTerms(text) {
  // Extract terms that appear in quotes or special markers
  const terms = new Set();
  if (!text) return [...terms];

  // **bold** terms in markdown
  const boldMatches = text.match(/\*\*(.+?)\*\*/g);
  if (boldMatches) {
    boldMatches.forEach(m => {
      const t = m.replace(/\*\*/g, '').trim();
      if (isMeaningfulTerm(t)) terms.add(t);
    });
  }

  return [...terms];
}

function buildVocabularyPool(concepts) {
  const pool = new Set();

  concepts.forEach(c => {
    // From keyPoints
    if (c.card.keyPoints) {
      extractKeyTerms(c.card.keyPoints).forEach(t => {
        if (isMeaningfulTerm(t)) pool.add(t);
      });
      // Also add the full keyPoints text as analysis
      c._keyPointsTerms = extractKeyTerms(c.card.keyPoints);
    }

    // From bold terms in enrichedDefinition
    if (c.card.enrichedDefinition) {
      extractQuotedTerms(c.card.enrichedDefinition).forEach(t => {
        if (isMeaningfulTerm(t)) pool.add(t);
      });
    }

    // Extract key phrases from definition
    if (c.card.definition) {
      extractQuotedTerms(c.card.definition).forEach(t => {
        if (isMeaningfulTerm(t)) pool.add(t);
      });
    }
  });

  return [...pool];
}

function pickBestTerm(concept) {
  // Get terms specific to this concept
  const ownTerms = concept._keyPointsTerms || [];

  // Filter to good blank candidates (3-10 chars, Korean)
  const candidates = ownTerms.filter(t => {
    if (t === concept.name) return false;
    if (t.length < 3 || t.length > 12) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // Pick the one that appears most prominently in content
  const def = stripMarkdown(concept.card.definition);
  const kp = (concept.card.keyPoints || []).join(' ');

  const scored = candidates.map(t => {
    let score = 0;
    if (def.includes(t)) score += 3;
    if (kp.includes(t)) score += 2;
    if ((concept.caution || '').includes(t)) score += 1;
    // Prefer 3-7 char terms
    if (t.length >= 3 && t.length <= 7) score += 2;
    return { term: t, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.term || null;
}

function buildSentenceFromSource(concept, blankTerm) {
  const sources = [
    concept.card.definition,
    ...(Array.isArray(concept.card.keyPoints) ? concept.card.keyPoints : []),
    concept.card.enrichedDefinition || '',
  ];

  for (const source of sources) {
    if (!source || typeof source !== 'string') continue;
    const cleaned = stripMarkdown(source);
    const sentences = splitSentences(cleaned);

    for (const sent of sentences) {
      if (!sent.includes(blankTerm)) continue;

      let replaced = sent;
      // Replace exactly once, being careful about overlapping
      const idx = sent.indexOf(blankTerm);
      if (idx === -1) continue;
      replaced = sent.substring(0, idx) + '[blank]' + sent.substring(idx + blankTerm.length);

      if (replaced.length < 30 || replaced.length > 100) continue;

      const blankCount = (replaced.match(/\[blank\]/g) || []).length;
      if (blankCount !== 1) continue;

      // Ensure the blank is not at the very start or end
      if (replaced.startsWith('[blank]') || replaced.endsWith('[blank]')) continue;

      // Ensure it reads naturally - should have content before and after
      const parts = replaced.split('[blank]');
      if (parts[0].length < 5 || parts[1].length < 5) continue;

      return replaced;
    }
  }

  return null;
}

function buildConstructedSentence(concept, blankTerm) {
  // Manually construct a sentence using key points
  const kp = Array.isArray(concept.card.keyPoints) ? concept.card.keyPoints : [];
  for (const point of kp) {
    if (typeof point !== 'string') continue;
    if (!point.includes(blankTerm)) continue;

    let replaced = point;
    const idx = point.indexOf(blankTerm);
    if (idx === -1) continue;
    replaced = point.substring(0, idx) + '[blank]' + point.substring(idx + blankTerm.length);

    if (replaced.length >= 30 && replaced.length <= 100) {
      const blankCount = (replaced.match(/\[blank\]/g) || []).length;
      if (blankCount === 1) return replaced;
    }
  }
  return null;
}

function buildSentenceTemplate(concept, blankTerm) {
  // Try source-based first
  const fromSource = buildSentenceFromSource(concept, blankTerm);
  if (fromSource) return fromSource;

  // Try constructed from keyPoints
  const constructed = buildConstructedSentence(concept, blankTerm);
  if (constructed) return constructed;

  return null;
}

function getDistractors(correctTerm, allPool, conceptNames) {
  const others = allPool.filter(t =>
    t !== correctTerm &&
    t.length >= 3 && t.length <= 15 &&
    isMeaningfulTerm(t) &&
    !conceptNames.includes(t)
  );
  const shuffled = others.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  console.log('Loading units...');
  const sungjikUnits = loadUnits('sungjik');
  const kongilUnits = loadUnits('kongil');

  const sungjikCount = sungjikUnits.reduce((s, u) => s + u.concepts.length, 0);
  const kongilCount = kongilUnits.reduce((s, u) => s + u.concepts.length, 0);
  console.log(`Sungjik: ${sungjikUnits.length} units, ${sungjikCount} concepts`);
  console.log(`Kongil: ${kongilUnits.length} units, ${kongilCount} concepts`);

  // Delete all existing quiz_cache entries
  console.log('Deleting existing quiz_cache entries...');
  const { error: delErr } = await supabase
    .from('quiz_cache')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (delErr) {
    console.error('Delete error:', delErr);
  } else {
    console.log('All existing entries deleted.');
  }

  const allQuestions = [];

  for (const units of [sungjikUnits, kongilUnits]) {
    for (const unit of units) {
      const subject = unit.concepts[0]?.id?.startsWith('success') ? 'sungjik' : 'kongil';
      const conceptNames = unit.concepts.map(c => c.name);

      // Build vocabulary pool
      const termPool = buildVocabularyPool(unit.concepts);
      console.log(`\n${subject} Unit ${unit.unit} (${unit.unitTitle}): ${unit.concepts.length} concepts, ${termPool.length} terms`);

      const questions = [];
      let skipped = 0;

      for (const concept of unit.concepts) {
        const correctAnswer = pickBestTerm(concept);

        if (!correctAnswer) {
          skipped++;
          continue;
        }

        const sentenceTemplate = buildSentenceTemplate(concept, correctAnswer);

        if (!sentenceTemplate) {
          skipped++;
          continue;
        }

        const blankCount = (sentenceTemplate.match(/\[blank\]/g) || []).length;
        if (blankCount !== 1) {
          skipped++;
          continue;
        }

        let distractors = getDistractors(correctAnswer, termPool, conceptNames);

        if (distractors.length < 3) {
          // Pad with concept names from other units that fit
          const extra = conceptNames.filter(n =>
            n !== concept.name && n !== correctAnswer && !distractors.includes(n) && n.length <= 15
          );
          while (distractors.length < 3 && extra.length > 0) {
            distractors.push(extra.shift());
          }
        }

        if (distractors.length < 3) {
          skipped++;
          continue;
        }

        const options = shuffleArray([correctAnswer, ...distractors.slice(0, 3)]);

        questions.push({
          sentence_template: sentenceTemplate,
          correct_answer: correctAnswer,
          options: options,
          concept_name: concept.name,
        });

        console.log(`  ✓ "${correctAnswer}" ← ${concept.name}`);
      }

      if (skipped > 0) {
        console.log(`  ⚠ Skipped ${skipped} concepts (no suitable term/sentence)`);
      }

      if (questions.length > 0) {
        const { error } = await supabase
          .from('quiz_cache')
          .upsert({
            subject: subject,
            unit_number: unit.unit,
            cache_type: 'blank',
            quiz_count: 10,
            data: questions,
          }, {
            onConflict: 'subject,unit_number,cache_type,quiz_count',
          });

        if (error) {
          console.error(`  ERROR:`, error.message);
        } else {
          console.log(`  → Inserted ${questions.length} questions`);
        }
      }

      allQuestions.push(...questions);
    }
  }

  // ================================================================
  // VERIFICATION
  // ================================================================
  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`VERIFICATION`);
  console.log(`${'='.repeat(60)}`);

  let validCount = 0;
  const issues = [];

  allQuestions.forEach((q) => {
    const blankCount = (q.sentence_template.match(/\[blank\]/g) || []).length;
    const hasCorrect = q.options.includes(q.correct_answer);
    const uniqueOptions = new Set(q.options).size;
    const rightOptionCount = q.options.length;

    const problems = [];
    if (blankCount !== 1) problems.push(`blanks=${blankCount}`);
    if (!hasCorrect) problems.push('correct NOT in options');
    if (uniqueOptions !== rightOptionCount) problems.push(`duplicates: ${uniqueOptions}/${rightOptionCount}`);
    if (rightOptionCount !== 4) problems.push(`options count=${rightOptionCount}`);

    if (problems.length === 0) {
      validCount++;
    } else {
      issues.push({ concept: q.concept_name, problems });
    }
  });

  console.log(`\nTotal: ${allQuestions.length}`);
  console.log(`Valid: ${validCount}`);
  console.log(`Issues: ${allQuestions.length - validCount}`);

  if (issues.length > 0) {
    console.log(`\nIssues (first 10):`);
    issues.slice(0, 10).forEach(i => {
      console.log(`  - ${i.concept}: ${i.problems.join('; ')}`);
    });
  }

  // ================================================================
  // BEST EXAMPLES
  // ================================================================
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TOP 3 BEST EXAMPLES`);
  console.log(`${'='.repeat(60)}`);

  // Score by quality: right length, no weird characters, has context
  const scored = allQuestions
    .map((q) => {
      let score = 0;
      const t = q.sentence_template;
      // Prefer 40-80 chars
      if (t.length >= 40 && t.length <= 80) score += 3;
      else if (t.length >= 30 && t.length <= 100) score += 1;
      // Penalize very short or too long
      // Good answer length
      if (q.correct_answer.length >= 3 && q.correct_answer.length <= 8) score += 2;
      // Not starting with blank
      if (!t.startsWith('[blank]')) score += 2;
      // Not ending with blank
      if (!t.endsWith('[blank]')) score += 2;
      // Content before and after blank
      const parts = t.split('[blank]');
      if (parts.length === 2 && parts[0].length >= 15 && parts[1].length >= 10) score += 2;
      return { ...q, _score: score };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 3);

  scored.forEach((q, i) => {
    console.log(`\n[Example ${i + 1}] (score=${q._score})`);
    console.log(`  Concept: ${q.concept_name}`);
    console.log(`  Sentence: "${q.sentence_template}"`);
    console.log(`  Answer: "${q.correct_answer}"`);
    console.log(`  Options: [${q.options.join(', ')}]`);
  });

  console.log(`\nDone!`);
}

main().catch(console.error);
