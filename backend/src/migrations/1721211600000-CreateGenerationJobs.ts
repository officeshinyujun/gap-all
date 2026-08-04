import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateGenerationJobs1721211600000 implements MigrationInterface {
  name = 'CreateGenerationJobs1721211600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('generation_jobs')) return;
    await queryRunner.createTable(
      new Table({
        name: 'generation_jobs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'user_id', type: 'varchar' },
          { name: 'status', type: 'varchar', length: '20' },
          { name: 'request', type: 'jsonb' },
          { name: 'state', type: 'jsonb' },
          { name: 'heartbeat_at', type: 'timestamp' },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('generation_jobs')) {
      await queryRunner.dropTable('generation_jobs');
    }
  }
}
