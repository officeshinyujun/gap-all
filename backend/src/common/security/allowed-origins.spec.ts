import {
  getAllowedOrigins,
  getFrontendOrigin,
  isAllowedOrigin,
} from './allowed-origins';

describe('allowed origins', () => {
  it('normalizes and de-duplicates configured origins', () => {
    expect(
      getAllowedOrigins({
        CORS_ORIGINS:
          'https://app.example.com/, https://admin.example.com,https://app.example.com',
      }),
    ).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });

  it('only accepts configured origins', () => {
    const env = { CORS_ORIGINS: 'https://app.example.com' };
    expect(isAllowedOrigin('https://app.example.com', env)).toBe(true);
    expect(isAllowedOrigin('https://attacker.example.com', env)).toBe(false);
  });

  it('uses an allowlisted frontend origin and rejects invalid configuration', () => {
    expect(
      getFrontendOrigin({
        CORS_ORIGINS: 'https://app.example.com',
        FRONTEND_URL: 'https://app.example.com/',
      }),
    ).toBe('https://app.example.com');
    expect(() => getFrontendOrigin({ CORS_ORIGINS: 'not-a-url' })).toThrow(
      'CORS_ORIGINS must include at least one valid origin',
    );
  });
});
