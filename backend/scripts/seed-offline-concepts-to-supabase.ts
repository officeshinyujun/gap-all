import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

interface Concept {
  rank: number;
  name: string;
  frequency: number;
  sources: string[];
  description: string;
  keyPoints: string[];
  conceptContent: string;
  enrichedDefinition: string;
  unitNumber: number;
  conceptId: string;
}

function normalize(item: any, subject: string): Concept {
  const card = item.card;
  const isIndustry = !!card;

  return {
    rank: item.rank,
    name: item.name,
    frequency: item.frequency ?? 0,
    sources: item.sources ?? [],
    description: isIndustry
      ? (card.definition ?? '')
      : (item.description || item.definition || ''),
    keyPoints: isIndustry
      ? (card.keyPoints ?? [])
      : (item.keyPoints ?? []),
    conceptContent: isIndustry
      ? (card.textbookExcerpt ?? '')
      : (item.conceptContent ?? ''),
    enrichedDefinition: isIndustry
      ? (card.enrichedDefinition ?? '')
      : (item.enrichedDefinition || item.enriched_definition || ''),
    unitNumber: item._offline?.unitNumber ?? 0,
    conceptId: item.id ?? `${subject}_${item._offline?.unitNumber ?? 0}_${String(item.rank).padStart(2, '0')}`,
  };
}

async function seedSubject(
  supabaseSubject: string,
  jsonPath: string,
  generateIdPrefix: string,
) {
  const data: any[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const allConcepts = data.map((item) => normalize(item, generateIdPrefix));

  const byUnit = new Map<number, Concept[]>();
  for (const c of allConcepts) {
    if (!c.unitNumber) {
      console.log(`  ⚠️  skipping concept with no unit number: ${c.name}`);
      continue;
    }
    if (!byUnit.has(c.unitNumber)) byUnit.set(c.unitNumber, []);
    byUnit.get(c.unitNumber)!.push(c);
  }

  let conceptCount = 0;
  let cardCount = 0;

  for (const [unitNumber, concepts] of byUnit.entries()) {
    const { data: unit } = await supabase
      .from('textbook_units')
      .select('id')
      .eq('subject', supabaseSubject)
      .eq('unit_number', unitNumber)
      .single();

    if (!unit) {
      console.log(`  ⚠️  unit not found: ${supabaseSubject}/Unit ${unitNumber}`);
      continue;
    }

    // ponytail: representative tags만 갱신한다. textbook_concept_cards는
    // cards_moi의 real_question(conceptHighlightV2 등)을 담고 있으므로 절대 덮어쓰지 않는다.
    await supabase.from('textbook_concepts').delete().eq('unit_id', unit.id);

    for (const c of concepts) {
      const { error: cErr } = await supabase.from('textbook_concepts').insert({
        unit_id: unit.id,
        concept_name: c.name,
        sort_order: c.rank,
      });
      if (cErr) {
        console.log(`  ❌ concept insert failed: ${c.name} — ${cErr.message}`);
        continue;
      }
      conceptCount++;
    }

    console.log(`  ✅ Unit ${unitNumber} (${concepts.length} concepts)`);
  }

  return { conceptCount, cardCount };
}

async function main() {
  console.log('🌱 Seeding offline concept tags to Supabase...\n');

  // success → sungjik, industry → kongil
  const subjects = [
    {
      label: 'success → sungjik',
      supabaseSubject: 'sungjik',
      jsonPath: path.join(ROOT, 'textbook', '_v2', 'rebuild', 'success', 'all-concept-tags-offline.json'),
      idPrefix: 'sungjik',
    },
    {
      label: 'industry → kongil',
      supabaseSubject: 'kongil',
      jsonPath: path.join(ROOT, 'textbook', '_v2', 'rebuild', 'industry', 'all-concept-tags-offline.json'),
      idPrefix: 'kongil',
    },
  ];

  let totalConcepts = 0;
  let totalCards = 0;

  for (const s of subjects) {
    console.log(`📚 ${s.label}`);
    const { conceptCount, cardCount } = await seedSubject(s.supabaseSubject, s.jsonPath, s.idPrefix);
    totalConcepts += conceptCount;
    totalCards += cardCount;
    console.log(`   ↳ ${conceptCount} concepts, ${cardCount} cards\n`);
  }

  console.log(`🎉 Done! Total: ${totalConcepts} concepts, ${totalCards} cards`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
