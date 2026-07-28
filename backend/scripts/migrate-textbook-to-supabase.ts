import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

// ====== 1. 교과서 원문 ======
async function migrateTextbookUnits() {
  console.log('\n📚 교과서 원문 → textbook_units');
  for (const [folder, subject] of [['kongil', 'kongil'], ['sungjik', 'sungjik']] as const) {
    const dir = path.join(ROOT, 'textbook', folder);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    for (const file of files) {
      const m = file.match(/Unit_(\d+)/); if (!m) continue;
      const unitNumber = parseInt(m[1]);
      const text = fs.readFileSync(path.join(dir, file), 'utf-8');
      const { error } = await supabase.from('textbook_units').upsert({
        subject, unit_number: unitNumber, unit_name: `${unitNumber}단원`, text_payload: text,
      }, { onConflict: 'subject, unit_number' });
      console.log(error ? `  ❌ ${file}` : `  ✅ ${file}`);
    }
  }
}

// ====== 2. 개념 리스트 ======
async function migrateConcepts() {
  console.log('\n🏷️  개념 리스트 → textbook_concepts');
  for (const [folder, subject] of [['kongil', 'kongil'], ['sungjik', 'sungjik']] as const) {
    const dir = path.join(ROOT, 'textbook', 'concepts', folder);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const m = file.match(/Unit_(\d+)/); if (!m) continue;
      const unitNumber = parseInt(m[1]);
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      const { data: unit } = await supabase.from('textbook_units').select('id')
        .eq('subject', subject).eq('unit_number', unitNumber).single();
      if (!unit) { console.log(`  ⚠️ unit not found: ${subject}/${unitNumber}`); continue; }
      for (let i = 0; i < data.concepts.length; i++) {
        await supabase.from('textbook_concepts').upsert({
          unit_id: unit.id, concept_name: data.concepts[i], sort_order: i,
        }, { onConflict: 'unit_id, concept_name' });
      }
      console.log(`  ✅ ${file} (${data.concepts.length})`);
    }
  }
}

// ====== 3. 요약 카드 ======
async function migrateSummationCards() {
  console.log('\n🃏 요약 카드 → textbook_summation_cards');
  for (const [folder, subject] of [['kongil_summation_v2', 'kongil'], ['sungjik_summation_v2', 'sungjik']] as const) {
    const dir = path.join(ROOT, 'textbook', folder);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const m = file.match(/(\d+)단원/); if (!m) continue;
      const unitNumber = parseInt(m[1]);
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      const { data: unit } = await supabase.from('textbook_units').select('id')
        .eq('subject', subject).eq('unit_number', unitNumber).single();
      if (!unit) { console.log(`  ⚠️ unit not found: ${subject}/${unitNumber}`); continue; }
      const cards = data.cards ?? [];
      for (let i = 0; i < cards.length; i++) {
        await supabase.from('textbook_summation_cards').upsert({
          unit_id: unit.id, card_index: i,
          title: cards[i].content?.title ?? null,
          body: cards[i].content?.body ?? null,
          key_concepts: cards[i].content?.key_concepts ?? null,
        }, { onConflict: 'unit_id, card_index' });
      }
      console.log(`  ✅ ${file} (${cards.length})`);
    }
  }
}

async function main() {
  console.log('🚀 Textbook → Supabase\n');
  await migrateTextbookUnits();
  await migrateConcepts();
  await migrateSummationCards();
  console.log('\n✅ Done!');
}
main().catch(console.error);
