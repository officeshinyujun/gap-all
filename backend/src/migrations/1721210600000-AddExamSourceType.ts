import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddExamSourceType1721210600000 implements MigrationInterface {
  name = 'AddExamSourceType1721210600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasTable('exam_records')) ||
      (await queryRunner.hasColumn('exam_records', 'source_type'))
    ) {
      return;
    }

    await queryRunner.addColumn(
      'exam_records',
      new TableColumn({
        name: 'source_type',
        type: 'varchar',
        length: '20',
        default: "'ai'",
        isNullable: false,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (
      (await queryRunner.hasTable('exam_records')) &&
      (await queryRunner.hasColumn('exam_records', 'source_type'))
    ) {
      await queryRunner.dropColumn('exam_records', 'source_type');
    }
  }
}
