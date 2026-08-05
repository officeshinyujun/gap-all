import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateAiReferenceAnalyses1721211900000
  implements MigrationInterface
{
  name = 'CreateAiReferenceAnalyses1721211900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('ai_reference_analyses')) return;

    await queryRunner.createTable(
      new Table({
        name: 'ai_reference_analyses',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'source_id', type: 'varchar' },
          { name: 'source_hash', type: 'varchar' },
          { name: 'analysis_version', type: 'varchar', length: '32' },
          { name: 'provider_model', type: 'varchar', isNullable: true },
          { name: 'prompt_hash', type: 'varchar', isNullable: true },
          { name: 'analysis', type: 'jsonb' },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
        uniques: [
          {
            name: 'UQ_ai_reference_analyses_source_version',
            columnNames: ['source_id', 'analysis_version'],
          },
        ],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('ai_reference_analyses')) {
      await queryRunner.dropTable('ai_reference_analyses');
    }
  }
}
