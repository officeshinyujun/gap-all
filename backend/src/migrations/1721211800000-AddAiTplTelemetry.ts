import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiTplTelemetry1721211800000 implements MigrationInterface {
  name = 'AddAiTplTelemetry1721211800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_generation_candidates" ADD "template" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_generation_runs" ADD "rejections_by_template" jsonb`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_generation_runs" DROP COLUMN "rejections_by_template"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_generation_candidates" DROP COLUMN "template"`,
    );
  }
}
