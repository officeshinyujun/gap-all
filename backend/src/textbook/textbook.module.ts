import { Module } from '@nestjs/common';
import { TextbookService } from './textbook.service';
import { TextbookEmbeddingService } from './textbook-embedding.service';

@Module({
  providers: [TextbookService, TextbookEmbeddingService],
  exports: [TextbookService, TextbookEmbeddingService],
})
export class TextbookModule {}
