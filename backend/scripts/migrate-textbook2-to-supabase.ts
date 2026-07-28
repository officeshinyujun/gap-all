import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

type SubjectFolder = [string, string]; // [folder, subject]

// ====== 4. 구조화된 단원 (structured) ======
async function migrateStructuredUnits() {
  console.log('\n📖 구조화된 단원 → textbook_structured_units/sections/subsections');
  for (const [folder, subject] of [['kongil_structured', 'kongil'], ['sungjik_structured', 'sungjik']] as SubjectFolder[]) {
    const dir = path.join(ROOT, 'textbook', folder);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const m = file.match(/(\d+)단원/); if (!m) continue;
      const unitNumber = parseInt(m[1]);
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      const { data: unit } = await supabase.from('textbook_units').select('id')
        .eq('subject', subject).eq('unit_number', unitNumber).single();
      if (!unit) { console.log(`  ⚠️ unit not found: ${file}`); continue; }

      // structured unit
      const { data: su } = await supabase.from('textbook_structured_units').insert({
        unit_id: unit.id, subject: data.subject, unit_title: data.unitTitle,
        learning_objectives: data.learningObjectives, closing_summary: data.closingSummary,
      }).select('id').single();
      if (!su) { console.log(`  ❌ ${file} insert failed`); continue; }

      // sections & subsections
      const sections = data.sections ?? [];
      for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        const { data: secRow } = await supabase.from('textbook_sections').insert({
          structured_unit_id: su.id, section_index: si, title: sec.title, summary: sec.summary,
        }).select('id').single();
        if (!secRow) continue;

        for (let ssi = 0; ssi < (sec.subsections ?? []).length; ssi++) {
          const sub = sec.subsections[ssi];
          await supabase.from('textbook_subsections').insert({
            section_id: secRow.id, subsection_index: ssi, title: sub.title,
            explanation: sub.explanation, key_points: sub.keyPoints,
            table_content: sub.table, visual_guide: sub.visualGuide,
            supplement_note: sub.supplementNote, exam_points: sub.examPoints,
            pitfalls: sub.pitfalls,
          });
        }
      }
      console.log(`  ✅ ${file} (${sections.length} sections)`);
    }
  }
}

// ====== 5. 개념 카드 (cards_moi) ======
async function migrateConceptCards() {
  console.log('\n🃏 개념 카드 → textbook_concept_cards');
  const subjects: SubjectFolder[] = [
    ['kongil_cards_moi', 'kongil'],
    ['success_cards_moi', 'sungjik'],
  ];
  for (const [folder, subject] of subjects) {
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

      for (const c of data.concepts ?? []) {
        await supabase.from('textbook_concept_cards').upsert({
          unit_id: unit.id, concept_id: c.id, rank: c.rank, name: c.name,
          frequency: c.frequency, sources: c.sources,
          definition: c.card?.definition,
          key_points: c.card?.keyPoints,
          textbook_excerpt: c.card?.textbookExcerpt,
          enriched_definition: c.card?.enrichedDefinition,
        }, { onConflict: 'unit_id, concept_id' });
      }
      console.log(`  ✅ ${file} (${(data.concepts ?? []).length} concepts)`);
    }
  }
}

// ====== 6. 마인드맵 ======
async function migrateMindmaps() {
  console.log('\n🧠 마인드맵 → textbook_mindmaps');
  const dir = path.join(ROOT, 'textbook', 'success_mindmaps');
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const m = file.match(/(\d+)단원/); if (!m) continue;
    const unitNumber = parseInt(m[1]);
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    const { data: unit } = await supabase.from('textbook_units').select('id')
      .eq('subject', 'sungjik').eq('unit_number', unitNumber).single();
    if (!unit) { console.log(`  ⚠️ unit not found: ${unitNumber}`); continue; }
    await supabase.from('textbook_mindmaps').upsert({
      unit_id: unit.id, mindmap_data: data,
    }, { onConflict: 'unit_id' });
    console.log(`  ✅ ${file}`);
  }
}

// ====== 7. 빈도 데이터 ======
async function migrateFrequencies() {
  console.log('\n📊 빈도 데이터 → textbook_frequencies');
  for (const [folder, subject] of [['kongil_frequency', 'kongil'], ['sungjik_frequency', 'sungjik']] as SubjectFolder[]) {
    const dir = path.join(ROOT, 'textbook', folder);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const m = file.match(/(\d+)단원/); if (!m) continue;
      const unitNumber = parseInt(m[1]);
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      const { data: unit } = await supabase.from('textbook_units').select('id')
        .eq('subject', subject).eq('unit_number', unitNumber).single();
      if (!unit) { console.log(`  ⚠️ unit not found: ${file}`); continue; }
      await supabase.from('textbook_frequencies').upsert({
        unit_id: unit.id, frequency_data: data,
      }, { onConflict: 'unit_id' });
      console.log(`  ✅ ${file}`);
    }
  }
}

async function main() {
  console.log('🚀 Textbook Part 2 → Supabase\n');
  await migrateStructuredUnits();
  await migrateConceptCards();
  await migrateMindmaps();
  await migrateFrequencies();
  console.log('\n✅ Done!');
}
main().catch(console.error);
