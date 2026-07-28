import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main() {
  for (const [folder, subject] of [['kongil_cards_moi', 'kongil'], ['success_cards_moi', 'sungjik']] as const) {
    const dir = path.join(ROOT, 'textbook', folder);
    if (!fs.existsSync(dir)) continue;
    let count = 0;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const m = file.match(/(\d+)단원/); if (!m) continue;
      const un = parseInt(m[1]);
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      const { data: unit } = await supabase.from('textbook_units').select('id').eq('subject', subject).eq('unit_number', un).single();
      if (!unit) { console.log(`⚠️ ${subject}/${un}`); continue; }
      for (const c of data.concepts ?? []) {
        await supabase.from('textbook_concept_cards').upsert({
          unit_id: unit.id, concept_id: c.id, rank: c.rank, name: c.name,
          frequency: c.frequency, sources: c.sources,
          definition: c.card?.definition, key_points: c.card?.keyPoints,
          textbook_excerpt: c.card?.textbookExcerpt,
          enriched_definition: c.card?.enrichedDefinition,
        }, { onConflict: 'unit_id, concept_id' });
        count++;
      }
    }
    console.log(`${folder}: ${count} cards`);
  }
  console.log('Done');
}
main();
