import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

// ponytail: dynamic callbackURL for both localhost and Tailscale token exchange
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext): any {
    const req = context.switchToHttp().getRequest<Request>();
    const host = req.get('host') || 'localhost:3001';
    const protocol = host.includes('localhost') || host.startsWith('127.') || host.startsWith('192.')
      ? 'http'
      : 'https';
    return { callbackURL: `${protocol}://${host}/auth/google/callback` };
  }
}
