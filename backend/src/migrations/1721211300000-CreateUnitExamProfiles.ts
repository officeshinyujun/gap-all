import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateUnitExamProfiles1721211300000 implements MigrationInterface {
  name = 'CreateUnitExamProfiles1721211300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('unit_exam_profiles')) return;

    await queryRunner.createTable(
      new Table({
        name: 'unit_exam_profiles',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'subject_slug', type: 'varchar' },
          { name: 'unit_number', type: 'int' },
          { name: 'profile_version', type: 'varchar', length: '32' },
          { name: 'source_fingerprint', type: 'varchar', length: '128' },
          { name: 'textbook_fingerprint', type: 'varchar', length: '128' },
          { name: 'profile', type: 'jsonb' },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
        uniques: [
          {
            name: 'UQ_unit_exam_profiles_subject_unit',
            columnNames: ['subject_slug', 'unit_number'],
          },
        ],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('unit_exam_profiles')) {
      await queryRunner.dropTable('unit_exam_profiles');
    }
  }
}
