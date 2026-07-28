import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const isDevelopment = process.env.NODE_ENV === 'development';
    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : isDevelopment && exception instanceof Error
          ? exception.message
          : 'Internal server error';

    // 비 HTTP 예외는 로깅 (실제 원인 파악용)
    if (!(exception instanceof HttpException)) {
      console.error(
        '[Unhandled Error]',
        exception instanceof Error ? exception.stack ?? exception.message : exception,
      );
    }

    response.status(status).json({
      statusCode: status,
      message:
        typeof message === 'object' && 'message' in message
          ? (message as any).message
          : message,
      timestamp: new Date().toISOString(),
      ...(isDevelopment && exception instanceof Error ? { stack: exception.stack } : {}),
    });
  }
}
