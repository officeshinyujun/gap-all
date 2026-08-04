import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAiProviderTelemetry1721211500000 implements MigrationInterface {
  name = 'AddAiProviderTelemetry1721211500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('ai_generation_candidates');
    if (table === undefined) return;
    const columns = [
      ['provider_model', 'varchar'],
      ['prompt_hash', 'varchar'],
      ['latency_ms', 'int'],
      ['provider_usage', 'jsonb'],
    ] as const;
    for (const [name, type] of columns) {
      if (table.findColumnByName(name) !== undefined) continue;
      await queryRunner.addColumn(
        'ai_generation_candidates',
        new TableColumn({ name, type, isNullable: true }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('ai_generation_candidates');
    if (table === undefined) return;
    for (const name of [
      'provider_usage',
      'latency_ms',
      'prompt_hash',
      'provider_model',
    ]) {
      if (table.findColumnByName(name) !== undefined) {
        await queryRunner.dropColumn('ai_generation_candidates', name);
      }
    }
  }
}
