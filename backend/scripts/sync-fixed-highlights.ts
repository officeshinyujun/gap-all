import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const FILES: { folder: string; dbSubject: string; unit: number }[] = [
  { folder: 'success_cards_moi', dbSubject: 'sungjik', unit: 4 },
  { folder: 'success_cards_moi', dbSubject: 'sungjik', unit: 6 },
  { folder: 'success_cards_moi', dbSubject: 'sungjik', unit: 15 },
  { folder: 'success_cards_moi', dbSubject: 'sungjik', unit: 16 },
  { folder: 'success_cards_moi', dbSubject: 'sungjik', unit: 18 },
  { folder: 'success_cards_moi', dbSubject: 'sungjik', unit: 19 },
  { folder: 'kongil_cards_moi', dbSubject: 'kongil', unit: 20 },
];

async function main() {
  const TEXTBOOK = path.resolve(__dirname, '..', '..', 'textbook');
  let synced = 0;

  for (const { folder, dbSubject, unit } of FILES) {
    const filePath = path.join(TEXTBOOK, folder, `${unit}단원.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    const { data: unitRow } = await supabase
      .from('textbook_units')
      .select('id')
      .eq('subject', dbSubject)
      .eq('unit_number', unit)
      .single();

    if (!unitRow) { console.log(`  ⚠️ unit ${dbSubject}/${unit} not found`); continue; }

    for (const c of (data.concepts || [])) {
      const v2 = c.realQuestion?.conceptHighlightV2;
      if (!v2) continue;

      const { data: cards } = await supabase
        .from('textbook_concept_cards')
        .select('id, real_question')
        .eq('unit_id', unitRow.id)
        .eq('name', c.name)
        .limit(1);

      if (!cards?.length) { console.log(`  ⚠️ ${c.name} not found`); continue; }

      const existing = cards[0].real_question || {};
      const updated = { ...existing, conceptHighlightV2: v2 };

      const { error } = await supabase
        .from('textbook_concept_cards')
        .update({ real_question: updated })
        .eq('id', cards[0].id);

      if (error) {
        console.log(`  ✗ ${c.name}: ${error.message}`);
      } else {
        synced++;
      }
    }
  }

  console.log(`\nSupabase synced: ${synced} concepts`);
}

main().catch(console.error);
