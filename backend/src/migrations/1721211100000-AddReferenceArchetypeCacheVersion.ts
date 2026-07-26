import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddReferenceArchetypeCacheVersion1721211100000 implements MigrationInterface {
  name = 'AddReferenceArchetypeCacheVersion1721211100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('reference_frame_cache'))) return;
    const table = await queryRunner.getTable('reference_frame_cache');
    if (table === undefined) return;
    if (!table.findColumnByName('contract_version')) {
      await queryRunner.addColumn(
        'reference_frame_cache',
        new TableColumn({
          name: 'contract_version',
          type: 'int',
          default: '1',
          isNullable: false,
        }),
      );
    }
    if (!table.findColumnByName('archetype_fingerprint')) {
      await queryRunner.addColumn(
        'reference_frame_cache',
        new TableColumn({
          name: 'archetype_fingerprint',
          type: 'varchar',
          default: "''",
          isNullable: false,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('reference_frame_cache'))) return;
    const table = await queryRunner.getTable('reference_frame_cache');
    if (table === undefined) return;
    if (table.findColumnByName('archetype_fingerprint')) {
      await queryRunner.dropColumn(
        'reference_frame_cache',
        'archetype_fingerprint',
      );
    }
    if (table.findColumnByName('contract_version')) {
      await queryRunner.dropColumn('reference_frame_cache', 'contract_version');
    }
  }
}
