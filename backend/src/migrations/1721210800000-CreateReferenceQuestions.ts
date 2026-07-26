import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateReferenceQuestions1721210800000 implements MigrationInterface {
  name = 'CreateReferenceQuestions1721210800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('reference_questions')) {
      return;
    }
    await queryRunner.createTable(
      new Table({
        name: 'reference_questions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'logical_source_id', type: 'varchar', isUnique: true },
          { name: 'content_hash', type: 'varchar' },
          { name: 'subject', type: 'varchar' },
          { name: 'unit_number', type: 'int' },
          { name: 'provenance_path', type: 'text' },
          { name: 'parse_version', type: 'varchar' },
          { name: 'source_payload', type: 'jsonb' },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
        ],
        uniques: [
          {
            name: 'UQ_reference_questions_logical_source_hash',
            columnNames: ['logical_source_id', 'content_hash'],
          },
        ],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('reference_questions')) {
      await queryRunner.dropTable('reference_questions');
    }
  }
}
