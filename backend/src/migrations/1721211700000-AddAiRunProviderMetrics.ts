import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAiRunProviderMetrics1721211700000 implements MigrationInterface {
  name = 'AddAiRunProviderMetrics1721211700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('ai_generation_runs');
    if (table === undefined) return;
    for (const name of [
      'provider_latency_ms',
      'prompt_tokens',
      'completion_tokens',
      'total_tokens',
    ]) {
      if (table.findColumnByName(name) !== undefined) continue;
      await queryRunner.addColumn(
        'ai_generation_runs',
        new TableColumn({ name, type: 'int', default: '0' }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('ai_generation_runs');
    if (table === undefined) return;
    for (const name of [
      'total_tokens',
      'completion_tokens',
      'prompt_tokens',
      'provider_latency_ms',
    ]) {
      if (table.findColumnByName(name) !== undefined) {
        await queryRunner.dropColumn('ai_generation_runs', name);
      }
    }
  }
}
