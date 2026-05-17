import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import type { Request } from 'express';

@Injectable()
export class SecurityLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('SecurityAudit');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = req;
    const userAgent = req.get('user-agent') ?? 'unknown';
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - now;
        this.logger.log(
          `[SUCCESS] ${method} ${url} | IP: ${ip} | UA: ${userAgent} | ${duration}ms`,
        );
      }),
      catchError((err) => {
        const duration = Date.now() - now;
        const status = err?.status ?? err?.getStatus?.() ?? 500;
        this.logger.warn(
          `[FAILED] ${method} ${url} | IP: ${ip} | UA: ${userAgent} | Status: ${status} | ${duration}ms`,
        );
        return throwError(() => err);
      }),
    );
  }
}
