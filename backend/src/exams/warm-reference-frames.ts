import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ReferenceFrameGenerationService } from './reference-frame-generation.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const service = app.get(ReferenceFrameGenerationService);
    console.log('[REFERENCE-WARMUP] starting');
    const summary = await service.warmCachedFrames();
    console.log(JSON.stringify(summary));
  } finally {
    await app.close();
  }
}

void main();
