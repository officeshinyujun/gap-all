import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddVariantGroupAndSeenRecords1721211200000 implements MigrationInterface {
  name = 'AddVariantGroupAndSeenRecords1721211200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'questions',
      new TableColumn({
        name: 'variant_group_id',
        type: 'varchar',
        isNullable: true,
      }),
    );

    const questions: Array<{
      id: string;
      subject_id: string;
      unit_id: string;
      target_concept: string;
      recommended_template: string;
    }> = await queryRunner.query(
      `SELECT id, subject_id, unit_id, target_concept, recommended_template FROM questions`,
    );
    for (const q of questions) {
      const groupId = `${q.subject_id}::${q.unit_id}::${q.target_concept}::${q.recommended_template}`;
      await queryRunner.query(
        `UPDATE questions SET variant_group_id = $1 WHERE id = $2`,
        [groupId, q.id],
      );
    }

    await queryRunner.query(
      `ALTER TABLE questions ALTER COLUMN variant_group_id SET NOT NULL`,
    );

    await queryRunner.createIndex(
      'questions',
      new TableIndex({
        name: 'IDX_questions_variant_group',
        columnNames: ['variant_group_id'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'question_seen_records',
        columns: [
          {
            name: 'user_id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'question_id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'seen_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            columnNames: ['question_id'],
            referencedTableName: 'questions',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      }),
    );

    const examItems: Array<{
      user_id: string;
      question_id: string;
      created_at: string;
    }> = await queryRunner.query(
      `SELECT DISTINCT er.user_id, ei.question_id, er.created_at
         FROM exam_items ei
         JOIN exam_records er ON er.id = ei.exam_id
         WHERE ei.question_id IS NOT NULL`,
    );
    for (const item of examItems) {
      await queryRunner.query(
        `INSERT INTO question_seen_records (user_id, question_id, seen_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, question_id) DO NOTHING`,
        [item.user_id, item.question_id, item.created_at],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('question_seen_records');
    await queryRunner.dropIndex('questions', 'IDX_questions_variant_group');
    await queryRunner.dropColumn('questions', 'variant_group_id');
  }
}
