import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumnOptions,
} from 'typeorm';

export class CreateGenerationRunTables1721210900000 implements MigrationInterface {
  name = 'CreateGenerationRunTables1721210900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await createTableIfMissing(queryRunner, 'generation_runs', [
      {
        name: 'id',
        type: 'uuid',
        isPrimary: true,
        generationStrategy: 'uuid',
        default: 'uuid_generate_v4()',
      },
      { name: 'idempotency_key', type: 'varchar', isUnique: true },
      { name: 'status', type: 'varchar', default: "'pending'" },
      { name: 'retry_count', type: 'int', default: '0' },
      { name: 'failure_reason', type: 'varchar', isNullable: true },
      { name: 'trusted_metadata', type: 'jsonb' },
      { name: 'created_at', type: 'timestamp', default: 'now()' },
    ]);
    await createTableIfMissing(queryRunner, 'generated_questions', [
      {
        name: 'id',
        type: 'uuid',
        isPrimary: true,
        generationStrategy: 'uuid',
        default: 'uuid_generate_v4()',
      },
      { name: 'generation_run_id', type: 'uuid' },
      { name: 'slot_id', type: 'varchar' },
      { name: 'trusted_content', type: 'jsonb' },
    ]);
    await createTableIfMissing(queryRunner, 'generation_exam_sessions', [
      {
        name: 'id',
        type: 'uuid',
        isPrimary: true,
        generationStrategy: 'uuid',
        default: 'uuid_generate_v4()',
      },
      { name: 'generation_run_id', type: 'uuid', isUnique: true },
      { name: 'public_exam_id', type: 'uuid', isNullable: true },
      { name: 'created_at', type: 'timestamp', default: 'now()' },
    ]);
    await createTableIfMissing(queryRunner, 'generation_exam_items', [
      {
        name: 'id',
        type: 'uuid',
        isPrimary: true,
        generationStrategy: 'uuid',
        default: 'uuid_generate_v4()',
      },
      { name: 'generation_exam_session_id', type: 'uuid' },
      { name: 'generated_question_id', type: 'uuid' },
      { name: 'order_index', type: 'int' },
    ]);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'generation_exam_items',
      'generation_exam_sessions',
      'generated_questions',
      'generation_runs',
    ]) {
      if (await queryRunner.hasTable(table)) await queryRunner.dropTable(table);
    }
  }
}

async function createTableIfMissing(
  queryRunner: QueryRunner,
  name: string,
  columns: TableColumnOptions[],
): Promise<void> {
  if (!(await queryRunner.hasTable(name)))
    await queryRunner.createTable(new Table({ name, columns }));
}
