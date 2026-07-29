import { csrfOriginMiddleware } from './csrf-origin.middleware';

describe('csrfOriginMiddleware', () => {
  const next = jest.fn();
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));

  beforeEach(() => {
    process.env.CORS_ORIGINS = 'https://app.example.com';
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.CORS_ORIGINS;
  });

  it('rejects an unsafe cookie-authenticated request from an untrusted origin', () => {
    csrfOriginMiddleware(
      {
        method: 'POST',
        cookies: { gap_access_token: 'access-token' },
        get: jest.fn(() => 'https://attacker.example.com'),
      } as any,
      { status } as any,
      next,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Forbidden' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('allows trusted origins and non-cookie API requests', () => {
    const trustedRequest = {
      method: 'PATCH',
      cookies: { gap_refresh_token: 'refresh-token' },
      get: jest.fn(() => 'https://app.example.com'),
    } as any;
    const bearerRequest = {
      method: 'DELETE',
      cookies: {},
      get: jest.fn(() => 'https://attacker.example.com'),
    } as any;

    csrfOriginMiddleware(trustedRequest, { status } as any, next);
    csrfOriginMiddleware(bearerRequest, { status } as any, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(status).not.toHaveBeenCalled();
  });
});
