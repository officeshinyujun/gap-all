import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReferenceQuestionUnitNumbers1721212100000
  implements MigrationInterface
{
  name = 'AddReferenceQuestionUnitNumbers1721212100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reference_questions" ADD COLUMN IF NOT EXISTS "unit_numbers" integer[] NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `UPDATE "reference_questions" SET "unit_numbers" = ARRAY["unit_number"]::integer[] WHERE cardinality("unit_numbers") = 0`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reference_questions_unit_numbers" ON "reference_questions" USING GIN ("unit_numbers")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_reference_questions_unit_numbers"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reference_questions" DROP COLUMN IF EXISTS "unit_numbers"`,
    );
  }
}
