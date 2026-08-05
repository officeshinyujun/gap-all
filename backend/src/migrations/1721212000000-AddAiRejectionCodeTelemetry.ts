import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiRejectionCodeTelemetry1721212000000 implements MigrationInterface {
  name = 'AddAiRejectionCodeTelemetry1721212000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_generation_runs" ADD "rejections_by_code" jsonb`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_generation_runs" DROP COLUMN "rejections_by_code"`,
    );
  }
}
