// Rebuild explanations for all blank questions with complete, logical Korean.
// Uses full concept definition + matching keyPoints (no truncation, no formulaic phrasing).
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const MAP = { success_cards_moi: 'sungjik', kongil_cards_moi: 'kongil' };

async function main() {
  const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Build concept lookup
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

  const { data } = await s.from('quiz_cache').select('*').eq('cache_type', 'blank');
  let fixed = 0;

  for (const r of data || []) {
    const qs = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    if (!Array.isArray(qs)) continue;

    const concepts = lookup[r.subject]?.[r.unit_number] || [];

    for (const q of qs) {
      const ans = q.correct_answer;
      const sentence = q.sentence_template;

      // Score each concept by relevance to the answer term
      let best = null;
      for (const c of concepts) {
        const name = c.name || '';
        const def = c.card?.definition || '';
        const kps = (c.card?.keyPoints || c.keyPoints || []).map(String);
        const all = [name, def, ...kps].join(' ');
        const s1 = all.includes(ans) ? 3 : 0;
        const s2 = all.includes(ans.replace(/\s/g, '')) ? 2 : 0;
        // keyPoints match is stronger than generic definition
        const s3 = kps.some((k) => k.includes(ans)) ? 5 : 0;
        const score = s1 + s2 + s3;
        if (score > 0 && (!best || score > best.score)) best = { c, score };
      }
      const concept = best?.c || concepts[0] || {};
      const name = concept.name || '';
      const def = (concept.card?.definition || '').trim();
      const kps = (concept.card?.keyPoints || concept.keyPoints || []).map(String);

      // Find the keyPoint most related to the answer
      const relatedKp = kps.find((k) => k.includes(ans)) || null;

      // Build a proper explanation
      const parts = [];
      // 1. Direct answer sentence (restore the blank in the sentence)
      const answerSentence = sentence.replace(/\[blank\]/g, `'${ans}'`);
      parts.push(answerSentence);
      // 2. Related keyPoint if found
      if (relatedKp && relatedKp !== answerSentence) {
        parts.push(`따라서 ${relatedKp.replace(/\.$/, '')}.`);
      }
      // 3. Full definition (complete, not truncated)
      if (def && !def.includes(ans)) {
        parts.push(def);
      }

      q.explanation = parts.join(' ');
      q.options = q.options.map((o) => o.trim());
      fixed++;
    }

    await s.from('quiz_cache').update({ data: qs }).eq('id', r.id);
  }

  console.log('Rebuilt', fixed, 'explanations');
}
main().catch((e) => console.error(e.message));
