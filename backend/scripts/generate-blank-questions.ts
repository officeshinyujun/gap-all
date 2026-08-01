import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const MAP: Record<string, string> = {
  success_cards_moi: 'sungjik',
  kongil_cards_moi: 'kongil',
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Clean a term for use as option — remove trailing particles like "등", "및" */
function cleanTerm(t: string): string {
  return t.replace(/[等등]\s*$/, '').replace(/[및]\s*$/, '').replace(/[,，、]\s*$/, '').trim();
}

/**
 * Try to find a key term for this concept.
 * Returns {term, sentence} or null if nothing found.
 */
function extractKeyTerm(
  name: string,
  definition: string,
  keyPoints: string[],
): { term: string; sentence: string } | null {
  const firstKP = Array.isArray(keyPoints) && keyPoints.length > 0 ? String(keyPoints[0]) : '';
  const text = firstKP || definition;
  if (!text || typeof text !== 'string' || text.length < 20) return null;

  // Try: find a short distinctive term to blank
  // Strategy: blank the concept's most important keyword
  // The concept NAME itself is the most important term, but we want
  // a sub-term that requires understanding
  
  // 1. "X는 Y이다" pattern — blank Y (the definition's target)
  const definePat = text.match(/([가-힣\w]{2,12})(?:은|는|이란|란)\s/);
  if (definePat && definePat[1] !== name && definePat[1].length >= 2) {
    const term = definePat[1];
    const sentence = text.replace(new RegExp(escapeRegex(term), 'g'), '[blank]');
    if (sentence.includes('[blank]')) return { term, sentence };
  }

  // 2. Items in parentheses "(A, B, C)" — blank one
  const parenMatches = text.match(/\(([^)]{2,40})\)/g);
  if (parenMatches) {
    for (const pm of parenMatches) {
      const inner = pm.slice(1, -1);
      const items = inner.split(/[,，、]\s*/).map(cleanTerm).filter((s: string) => s.length >= 2 && s !== name);
      for (const item of items) {
        const sentence = text.replace(new RegExp(escapeRegex(item), 'g'), '[blank]');
        if (sentence.includes('[blank]')) return { term: item, sentence };
      }
    }
  }

  // 3. Quoted terms
  const quotedMatches = text.match(/[''']([^''']{2,15})[''']/g);
  if (quotedMatches) {
    for (const qm of quotedMatches) {
      const term = qm.replace(/[''']/g, '');
      const sentence = text.replace(new RegExp(escapeRegex(term), 'g'), '[blank]');
      if (sentence.includes('[blank]')) return { term, sentence };
    }
  }

  // 4. Key multi-char word that appears early in definition
  const words = text
    .replace(/[.,、，()''""]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^(?:이것|그것|저것|하는|있는|위한|통해|따라)$/.test(w));
  for (const w of words.slice(0, 5)) {
    if (w === name) continue;
    const sentence = text.replace(new RegExp(escapeRegex(w), 'g'), '[blank]');
    if (sentence.includes('[blank]')) return { term: w, sentence };
  }

  return null;
}

async function main() {
  const TEXTBOOK = path.resolve(__dirname, '..', '..', 'textbook');
  let total = 0;

  await supabase.from('quiz_cache').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  for (const [folder, dbSubject] of Object.entries(MAP)) {
    const base = path.join(TEXTBOOK, folder);
    const files = fs.readdirSync(base).filter((f) => f.endsWith('.json') && !f.startsWith('_'));

    for (const file of files) {
      const unit = parseInt(file.replace('단원.json', ''));
      const data = JSON.parse(fs.readFileSync(path.join(base, file), 'utf-8'));
      const concepts = (data.concepts || []).filter((c: any) => c.realQuestion?.questionData);
      if (concepts.length === 0) continue;

      const { data: unitRow } = await supabase
        .from('textbook_units')
        .select('id')
        .eq('subject', dbSubject)
        .eq('unit_number', unit)
        .single();
      if (!unitRow) continue;

      const questions: any[] = [];
      const usedTerms = new Set<string>();
      const usedSentences = new Set<string>();

      // Build term pool for this unit
      const termPool: string[] = [];
      for (const c of concepts) {
        const def = c.card?.definition || c.description || '';
        const kp = (c.card?.keyPoints || c.keyPoints || []).join(' ');
        const text = def + ' ' + kp;
        const qm = text.match(/[''']([^''']{2,12})[''']/g);
        const q = qm ? qm.map((m: string) => m.replace(/[''']/g, '')) : [];
        const pm = text.match(/\(([^)]{2,40})\)/g);
        const p = pm ? pm.flatMap((m: string) => m.slice(1, -1).split(/[,，、]/).map(cleanTerm)) : [];
        termPool.push(...q, ...p.filter((t: string) => t.length >= 2));
      }

      for (const c of concepts) {
        const name = c.name.split('(')[0].trim();
        const def = c.card?.definition || c.description || '';
        const keyPoints = c.card?.keyPoints || c.keyPoints || [];

        const result = extractKeyTerm(name, def, keyPoints);
        if (!result) continue;

        const cleanAnswer = cleanTerm(result.term);
        if (cleanAnswer.length < 2 || usedTerms.has(cleanAnswer)) continue;

        const normSentence = result.sentence.replace(/\[blank\]/g, '').trim();
        if (usedSentences.has(normSentence)) continue;

        usedTerms.add(cleanAnswer);
        usedSentences.add(normSentence);

        // Options: only clean, relevant terms
        const pool = [...new Set(termPool.map(cleanTerm).filter(
          (t) => t !== cleanAnswer && t.length >= 2,
        ))];
        const wrongs = shuffle(pool).slice(0, 3);
        while (wrongs.length < 3) wrongs.push('기타');

        const opts = shuffle([cleanAnswer, ...wrongs]).slice(0, 4);

        questions.push({
          id: questions.length + 1,
          sentence_template: result.sentence,
          correct_answer: cleanAnswer,
          options: [...new Set(opts)],
          explanation: `'${cleanAnswer}'은/는 ${name}의 핵심 개념이다. ${def.slice(0, 100)}`,
        });
      }

      if (questions.length === 0) {
        console.log(`  - ${dbSubject}/${unit}: 추출 가능한 용어 없음`);
        continue;
      }

      const { error } = await supabase.from('quiz_cache').upsert(
        {
          subject: dbSubject,
          unit_number: unit,
          cache_type: 'blank',
          quiz_count: 10,
          data: questions,
        },
        { onConflict: 'subject,unit_number,cache_type,quiz_count' },
      );

      if (!error) {
        console.log(`  ✓ ${dbSubject}/${unit}: ${questions.length}문항`);
        total += questions.length;
      }
    }
  }
  console.log(`\n총 ${total}개`);
}

main().catch(console.error);
