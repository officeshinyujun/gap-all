import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLineageGenerationEvidence1721210500000 implements MigrationInterface {
  name = 'AddLineageGenerationEvidence1721210500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('question_generation_lineages'))) return;
    if (
      !(await queryRunner.hasColumn(
        'question_generation_lineages',
        'source_question_number',
      ))
    ) {
      await queryRunner.addColumn(
        'question_generation_lineages',
        new TableColumn({
          name: 'source_question_number',
          type: 'int',
          isNullable: true,
        }),
      );
    }
    if (
      !(await queryRunner.hasColumn(
        'question_generation_lineages',
        'generation_evidence',
      ))
    ) {
      await queryRunner.addColumn(
        'question_generation_lineages',
        new TableColumn({
          name: 'generation_evidence',
          type: 'text',
          isNullable: true,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('question_generation_lineages'))) return;
    if (
      await queryRunner.hasColumn(
        'question_generation_lineages',
        'generation_evidence',
      )
    ) {
      await queryRunner.dropColumn(
        'question_generation_lineages',
        'generation_evidence',
      );
    }
    if (
      await queryRunner.hasColumn(
        'question_generation_lineages',
        'source_question_number',
      )
    ) {
      await queryRunner.dropColumn(
        'question_generation_lineages',
        'source_question_number',
      );
    }
  }
}
