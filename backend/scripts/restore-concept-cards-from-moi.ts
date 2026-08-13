import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ponytail: seed-offline-concepts-to-supabase.ts wiped real_question/caution/quiz from
// textbook_concept_cards. Restore the rich cards_moi data (conceptHighlightV2 등).
const ROOT = path.resolve(__dirname, '..', '..');
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const SUBJECTS: Array<[string, string]> = [
  ['success_cards_moi', 'sungjik'],
  ['kongil_cards_moi', 'kongil'],
];

async function main() {
  const { count } = await supabase
    .from('textbook_concept_cards')
    .select('*', { count: 'exact', head: true });
  console.log(`기존 textbook_concept_cards: ${count}개 → 삭제 후 cards_moi로 재구성\n`);

  const { error: delErr } = await supabase.from('textbook_concept_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) throw delErr;

  let inserted = 0;
  let realQuestions = 0;

  for (const [folder, subject] of SUBJECTS) {
    const dir = path.join(ROOT, 'textbook', folder);
    const files = fs.readdirSync(dir).filter((f) => /^\d+단원\.json$/.test(f));
    for (const file of files) {
      const unitNumber = Number(file.match(/^(\d+)단원\.json$/)?.[1]);
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const { data: unit } = await supabase.from('textbook_units').select('id')
        .eq('subject', subject).eq('unit_number', unitNumber).single();
      if (!unit) { console.log(`  ⚠️ unit not found: ${subject}/${unitNumber}`); continue; }

      for (const c of data.concepts ?? []) {
        const { error } = await supabase.from('textbook_concept_cards').insert({
          unit_id: unit.id, concept_id: c.id, rank: c.rank, name: c.name,
          frequency: c.frequency, sources: c.sources,
          definition: c.card?.definition,
          key_points: c.card?.keyPoints,
          textbook_excerpt: c.card?.textbookExcerpt,
          enriched_definition: c.card?.enrichedDefinition,
          real_question: c.realQuestion ?? null,
          caution: c.caution ?? null,
          quiz: c.quiz ?? [],
        });
        if (error) { console.log(`  ❌ ${subject}/${unitNumber}/${c.id} — ${error.message}`); continue; }
        inserted += 1;
        if (c.realQuestion) realQuestions += 1;
      }
      console.log(`  ✅ ${folder}/${file} (${(data.concepts ?? []).length}개)`);
    }
  }

  console.log(`\n🎉 완료: ${inserted}개 카드, real_question 보유 ${realQuestions}개`);
}

main().catch((err) => { console.error(err); process.exit(1); });
