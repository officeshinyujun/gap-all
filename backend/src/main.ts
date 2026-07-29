import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { validateEnv } from './config/env-validation';
import { getAllowedOrigins } from './common/security/allowed-origins';
import { csrfOriginMiddleware } from './common/middleware/csrf-origin.middleware';

// .env 로드를 NestJS ConfigModule보다 먼저 실행 (validateEnv에서 필요)
dotenv.config();

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(
    cookieParser(
      process.env.OAUTH_STATE_SECRET ?? process.env.JWT_ACCESS_SECRET,
    ),
  );
  app.use(csrfOriginMiddleware);

  // 전역 ValidationPipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 전역 예외 필터
  app.useGlobalFilters(new HttpExceptionFilter());

  // CORS
  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}`);
}

void bootstrap();
