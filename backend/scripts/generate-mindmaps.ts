import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const apiKeyString =
  process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY || '';
const API_KEYS = apiKeyString
  .split(',')
  .map((k) => k.trim())
  .filter((k) => k.length > 0);

if (API_KEYS.length === 0) {
  console.error('API keys are missing in .env');
  process.exit(1);
}

const clients = API_KEYS.map((key) => new OpenAI({ apiKey: key }));
let clientIdx = 0;
function getClient(): OpenAI {
  return clients[clientIdx++ % clients.length];
}

const PROMPT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'prompts',
  'mindmap_generator.txt',
);
const DATA_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'textbook',
  'success_cards_moi',
);
const OUTPUT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'textbook',
  'success_mindmaps',
);

const systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');

interface ConceptInput {
  name: string;
  definition: string;
  keyPoints: string[];
  frequency: number;
}

async function generateMindmap(
  unit: number,
  unitTitle: string,
  concepts: ConceptInput[],
): Promise<any> {
  const client = getClient();
  const userContent = JSON.stringify({ unit, unitTitle, concepts });

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content ?? '';
  const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = codeBlock ? codeBlock[1].trim() : content.trim();
  return JSON.parse(raw);
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'));

  console.log(`${files.length}개 단원 마인드맵 생성 시작\n`);

  for (const file of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'),
    );
    if (!data.concepts) continue;

    const concepts: ConceptInput[] = data.concepts.map((c: any) => ({
      name: c.name,
      definition: c.card?.definition || '',
      keyPoints: c.card?.keyPoints || [],
      frequency: c.frequency || 0,
    }));

    console.log(`→ ${file} (${data.unitTitle}, ${concepts.length}개 개념)...`);

    try {
      const mindmap = await generateMindmap(
        data.unit,
        data.unitTitle,
        concepts,
      );

      const allConceptNames = concepts.map((c) => c.name);
      const mapConceptNames: string[] = [];
      function collectNames(node: any) {
        if (node.conceptName) mapConceptNames.push(node.conceptName);
        (node.children || []).forEach(collectNames);
      }
      collectNames(mindmap.rootNode);

      const missing = allConceptNames.filter(
        (n) => !mapConceptNames.includes(n),
      );
      if (missing.length > 0) {
        console.log(`  ⚠ 누락된 개념: ${missing.join(', ')}`);
      }

      const outputPath = path.join(OUTPUT_DIR, file);
      fs.writeFileSync(outputPath, JSON.stringify(mindmap, null, 2), 'utf-8');
      console.log(`  ✓ 저장 완료 (${mapConceptNames.length}개 개념 매핑)`);
    } catch (e) {
      console.error(`  ✗ 오류: ${(e as Error).message}`);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('\n완료!');
}

main().catch(console.error);
