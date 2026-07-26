import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateReferenceFrameCache1721211000000 implements MigrationInterface {
  name = 'CreateReferenceFrameCache1721211000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('reference_frame_cache')) return;
    await queryRunner.createTable(
      new Table({
        name: 'reference_frame_cache',
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
          { name: 'model', type: 'varchar' },
          { name: 'frame', type: 'jsonb' },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
        uniques: [
          {
            name: 'UQ_reference_frame_cache_source',
            columnNames: ['source_id', 'source_hash'],
          },
        ],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('reference_frame_cache')) {
      await queryRunner.dropTable('reference_frame_cache');
    }
  }
}
