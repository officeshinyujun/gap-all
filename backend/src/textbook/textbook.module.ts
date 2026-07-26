import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TextbookService } from './textbook.service';
import { TextbookEmbeddingService } from './textbook-embedding.service';
import { ReferenceQuestion } from '../entities/reference-question.entity';
import {
  ReferenceCatalogImportService,
  type ReferenceCatalogImportDependencies,
} from './reference-catalog-import.service';

function referenceCatalogImportDependencies(
  dataSource: DataSource,
): ReferenceCatalogImportDependencies {
  return {
    runInTransaction: async (work) =>
      dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(ReferenceQuestion);
        return work({
          findByLogicalSourceId: (logicalSourceId) =>
            repository.findOneBy({ logicalSourceId }),
          insert: async (record) => {
            await repository.save({
              logicalSourceId: record.logicalSourceId,
              contentHash: record.contentHash,
              subject: record.subject,
              unitNumber: record.unitNumber,
              provenancePath: record.provenancePath,
              parseVersion: record.parseVersion,
              sourcePayload: { ...record.sourcePayload },
            });
          },
        });
      }),
  };
}

@Module({
  providers: [
    TextbookService,
    TextbookEmbeddingService,
    {
      provide: ReferenceCatalogImportService,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) =>
        new ReferenceCatalogImportService(
          referenceCatalogImportDependencies(dataSource),
        ),
    },
  ],
  exports: [
    TextbookService,
    TextbookEmbeddingService,
    ReferenceCatalogImportService,
  ],
})
export class TextbookModule {}
