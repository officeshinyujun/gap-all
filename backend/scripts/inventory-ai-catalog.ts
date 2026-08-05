import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ReferenceQuestion } from '../src/entities/reference-question.entity';
import { buildAiCatalogInventory } from '../src/exams/ai-catalog-inventory';

async function main(): Promise<void> {
  const dataSource = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL ?? process.env.DATABASE_LOCAL_URL ?? process.env.DATABASE_SUPABASE_URL, entities: [ReferenceQuestion], synchronize: false });
  await dataSource.initialize();
  try {
    const report = buildAiCatalogInventory(await dataSource.getRepository(ReferenceQuestion).find());
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

void main();
