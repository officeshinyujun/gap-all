import type { NextFunction, Request, Response } from 'express';
import { isAllowedOrigin } from '../security/allowed-origins';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function csrfOriginMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const hasAuthCookie = Boolean(
    req.cookies?.['gap_access_token'] || req.cookies?.['gap_refresh_token'],
  );

  if (
    !UNSAFE_METHODS.has(req.method) ||
    !hasAuthCookie ||
    isAllowedOrigin(req.get('origin'))
  ) {
    next();
    return;
  }

  res.status(403).json({
    statusCode: 403,
    message: 'Cookie-authenticated requests require an allowed Origin header',
    error: 'Forbidden',
  });
}
