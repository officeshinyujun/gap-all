import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddQuestionGenerationLineage1721210700000 implements MigrationInterface {
  name = 'AddQuestionGenerationLineage1721210700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (
      !(await queryRunner.hasTable('questions')) ||
      (await queryRunner.hasColumn('questions', 'generation_lineage'))
    ) {
      return;
    }

    await queryRunner.addColumn(
      'questions',
      new TableColumn({
        name: 'generation_lineage',
        type: 'jsonb',
        isNullable: true,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (
      (await queryRunner.hasTable('questions')) &&
      (await queryRunner.hasColumn('questions', 'generation_lineage'))
    ) {
      await queryRunner.dropColumn('questions', 'generation_lineage');
    }
  }
}
