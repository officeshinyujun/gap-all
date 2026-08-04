import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateAiGenerationTables1721211400000 implements MigrationInterface {
  name = 'CreateAiGenerationTables1721211400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('ai_generation_runs'))) {
      await queryRunner.createTable(
        new Table({
          name: 'ai_generation_runs',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()',
            },
            {
              name: 'idempotency_key',
              type: 'varchar',
              length: '128',
              isUnique: true,
            },
            { name: 'user_id', type: 'varchar' },
            { name: 'subject_id', type: 'varchar' },
            {
              name: 'status',
              type: 'varchar',
              length: '20',
              default: "'pending'",
            },
            { name: 'request', type: 'jsonb' },
            { name: 'profile_version', type: 'varchar', length: '32' },
            { name: 'blueprint_version', type: 'varchar', length: '32' },
            { name: 'prompt_version', type: 'varchar', length: '32' },
            { name: 'validator_version', type: 'varchar', length: '32' },
            { name: 'progress', type: 'int', default: '0' },
            {
              name: 'stage',
              type: 'varchar',
              length: '32',
              default: "'queued'",
            },
            { name: 'accepted_count', type: 'int', default: '0' },
            { name: 'rejected_count', type: 'int', default: '0' },
            { name: 'provider_latency_ms', type: 'int', default: '0' },
            { name: 'prompt_tokens', type: 'int', default: '0' },
            { name: 'completion_tokens', type: 'int', default: '0' },
            { name: 'total_tokens', type: 'int', default: '0' },
            { name: 'failure_code', type: 'varchar', isNullable: true },
            { name: 'failure_reason', type: 'text', isNullable: true },
            { name: 'exam_id', type: 'uuid', isNullable: true },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
            { name: 'updated_at', type: 'timestamp', default: 'now()' },
          ],
        }),
      );
    }
    if (!(await queryRunner.hasTable('ai_generation_candidates'))) {
      await queryRunner.createTable(
        new Table({
          name: 'ai_generation_candidates',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()',
            },
            { name: 'run_id', type: 'uuid' },
            { name: 'blueprint_id', type: 'varchar' },
            { name: 'attempt', type: 'int' },
            { name: 'status', type: 'varchar', length: '20' },
            { name: 'failure_code', type: 'varchar', isNullable: true },
            { name: 'fingerprint', type: 'varchar', isNullable: true },
            { name: 'candidate', type: 'jsonb', isNullable: true },
            { name: 'validation', type: 'jsonb', isNullable: true },
            { name: 'provider_model', type: 'varchar', isNullable: true },
            { name: 'prompt_hash', type: 'varchar', isNullable: true },
            { name: 'latency_ms', type: 'int', isNullable: true },
            { name: 'provider_usage', type: 'jsonb', isNullable: true },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
          ],
          uniques: [
            {
              name: 'UQ_ai_generation_candidates_run_blueprint_attempt',
              columnNames: ['run_id', 'blueprint_id', 'attempt'],
            },
          ],
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('ai_generation_candidates')) {
      await queryRunner.dropTable('ai_generation_candidates');
    }
    if (await queryRunner.hasTable('ai_generation_runs')) {
      await queryRunner.dropTable('ai_generation_runs');
    }
  }
}
