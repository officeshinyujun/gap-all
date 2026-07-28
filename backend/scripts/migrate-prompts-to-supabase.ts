import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

const PROMPTS_DIR = path.join(ROOT, 'prompts');

function readFile(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

async function migratePrompts() {
  console.log('\n🤖 AI 프롬프트 → prompts');

  // step1/single/*.txt
  const singleDir = path.join(PROMPTS_DIR, 'step1', 'single');
  if (fs.existsSync(singleDir)) {
    for (const file of fs.readdirSync(singleDir)) {
      if (!file.endsWith('.txt')) continue;
      const variant = file.replace('.txt', ''); // single_low, single_middle, ...
      const template = readFile(path.join(singleDir, file));
      await supabase.from('prompts').upsert({
        step: 'step1', variant, prompt_template: template,
      }, { onConflict: 'step, variant, subject_style' });
      console.log(`  ✅ step1/single/${file}`);
    }
  }

  // step1/multi/*.txt
  const multiDir = path.join(PROMPTS_DIR, 'step1', 'multi');
  if (fs.existsSync(multiDir)) {
    for (const file of fs.readdirSync(multiDir)) {
      if (!file.endsWith('.txt')) continue;
      const variant = file.replace('.txt', ''); // multi_low, multi_middle, ...
      const template = readFile(path.join(multiDir, file));
      await supabase.from('prompts').upsert({
        step: 'step1', variant, prompt_template: template,
      }, { onConflict: 'step, variant, subject_style' });
      console.log(`  ✅ step1/multi/${file}`);
    }
  }

  // step2/*.txt
  const step2Dir = path.join(PROMPTS_DIR, 'step2');
  if (fs.existsSync(step2Dir)) {
    for (const file of fs.readdirSync(step2Dir)) {
      if (!file.endsWith('.txt')) continue;
      const variant = file.replace('.txt', ''); // kongil, intergrate, success, ...
      const template = readFile(path.join(step2Dir, file));
      await supabase.from('prompts').upsert({
        step: 'step2', variant, prompt_template: template,
      }, { onConflict: 'step, variant, subject_style' });
      console.log(`  ✅ step2/${file}`);
    }
  }

  // textbook/*.txt
  const textbookDir = path.join(PROMPTS_DIR, 'textbook');
  if (fs.existsSync(textbookDir)) {
    for (const file of fs.readdirSync(textbookDir)) {
      if (!file.endsWith('.txt')) continue;
      const variant = file.replace('.txt', '');
      const template = readFile(path.join(textbookDir, file));
      await supabase.from('prompts').upsert({
        step: 'textbook', variant, prompt_template: template,
      }, { onConflict: 'step, variant, subject_style' });
      console.log(`  ✅ textbook/${file}`);
    }
  }
}

async function migratePromptFragments() {
  console.log('\n📎 프롬프트 공통 조각 → prompt_fragments');
  const sharedDir = path.join(PROMPTS_DIR, '_shared');
  if (!fs.existsSync(sharedDir)) return;

  for (const file of fs.readdirSync(sharedDir)) {
    if (!file.endsWith('.txt')) continue;
    const key = file.replace('.txt', '');
    const content = readFile(path.join(sharedDir, file));
    await supabase.from('prompt_fragments').upsert({
      fragment_key: key, content,
    }, { onConflict: 'fragment_key' });
    console.log(`  ✅ ${file}`);
  }
}

async function main() {
  console.log('🚀 Prompts → Supabase\n');
  await migratePrompts();
  await migratePromptFragments();
  console.log('\n✅ Done!');
}
main().catch(console.error);
