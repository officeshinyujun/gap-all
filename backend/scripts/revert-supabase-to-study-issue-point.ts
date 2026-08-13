import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ponytail: restore the exact post-offline-seed checkpoint requested by the user.
const ROOT = path.resolve(__dirname, '..', '..');
const TEXTBOOK = path.join(ROOT, 'textbook');
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

function originalTags(folder: string, unit: number): string[] {
  const file = `textbook/concepts/${folder}/Unit_${String(unit).padStart(2, '0')}.json`;
  return JSON.parse(execFileSync('git', ['show', `HEAD:${file}`], { cwd: ROOT, encoding: 'utf8' })).concepts;
}

function readOffline(folder: string): any[] {
  return JSON.parse(fs.readFileSync(path.join(TEXTBOOK, '_v2', 'rebuild', folder, 'all-concept-tags-offline.json'), 'utf8'));
}

function cardRow(item: any, subject: string, tag: string) {
  const card = item.card;
  const industry = !!card;
  const unit = item._offline.unitNumber;
  const rank = item.rank;
  return {
    concept_id: item.id ?? `${subject}_${unit}_${String(rank).padStart(2, '0')}`,
    rank,
    name: tag,
    frequency: item.frequency ?? 0,
    sources: item.sources ?? [],
    definition: industry ? (card.definition ?? '') : (item.description || item.definition || ''),
    key_points: industry ? (card.keyPoints ?? []) : (item.keyPoints ?? []),
    textbook_excerpt: industry ? (card.textbookExcerpt ?? '') : (item.conceptContent ?? ''),
    enriched_definition: industry
      ? (card.enrichedDefinition ?? '')
      : (item.enrichedDefinition || item.enriched_definition || ''),
  };
}

async function main() {
  const subjects = [
    { offline: 'success', subject: 'sungjik' },
    { offline: 'industry', subject: 'kongil' },
  ] as const;
  const units = new Map<string, string>();
  for (const { subject } of subjects) {
    const { data, error } = await supabase.from('textbook_units').select('id,unit_number').eq('subject', subject);
    if (error) throw error;
    for (const unit of data ?? []) units.set(`${subject}:${unit.unit_number}`, unit.id);
  }

  const cards: Array<{ unit_id: string; subject: string; unit: number; row: any }> = [];
  const concepts: Array<{ unit_id: string; name: string; sort_order: number }> = [];
  for (const { offline, subject } of subjects) {
    for (let unit = 1; unit <= 20; unit++) {
      const unitId = units.get(`${subject}:${unit}`);
      if (!unitId) throw new Error(`Missing unit ${subject}/${unit}`);
      const tags = originalTags(offline === 'success' ? 'sungjik' : 'kongil', unit);
      tags.forEach((name, index) => concepts.push({ unit_id: unitId, name, sort_order: index + 1 }));
      for (const item of readOffline(offline).filter((c) => c._offline?.unitNumber === unit)) {
        const tag = tags[(item.rank ?? 1) - 1];
        if (!tag) throw new Error(`Missing tag ${subject}/${unit}/${item.rank}`);
        cards.push({ unit_id: unitId, subject, unit, row: cardRow(item, subject, tag) });
      }
    }
  }

  if (cards.length !== 260 || concepts.length !== 260) {
    throw new Error(`Unexpected checkpoint size: concepts=${concepts.length}, cards=${cards.length}`);
  }

  const { error: deleteCardsError } = await supabase
    .from('textbook_concept_cards')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (deleteCardsError) throw deleteCardsError;

  const { error: deleteConceptsError } = await supabase
    .from('textbook_concepts')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (deleteConceptsError) throw deleteConceptsError;

  const { error: insertConceptsError } = await supabase.from('textbook_concepts').insert(
    concepts.map(({ unit_id, name, sort_order }) => ({ unit_id, concept_name: name, sort_order })),
  );
  if (insertConceptsError) throw insertConceptsError;

  for (let i = 0; i < cards.length; i += 100) {
    const { error } = await supabase.from('textbook_concept_cards').insert(
      cards.slice(i, i + 100).map(({ unit_id, row }) => ({ unit_id, ...row })),
    );
    if (error) throw error;
  }

  const { count: conceptCount } = await supabase.from('textbook_concepts').select('*', { count: 'exact', head: true });
  const { data: cardCheck, count: cardCount } = await supabase
    .from('textbook_concept_cards').select('real_question,caution,quiz', { count: 'exact' });
  const richCount = (cardCheck ?? []).filter((row) => row.real_question != null || row.caution != null || (row.quiz ?? []).length > 0).length;
  console.log(JSON.stringify({ conceptCount, cardCount, cardsWithRichFields: richCount }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
