const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:5173',
];
const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173';

function normalizeOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    return new URL(value.trim()).origin;
  } catch {
    return undefined;
  }
}

export function getAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const configuredOrigins =
    env.CORS_ORIGINS?.split(',') ?? DEFAULT_ALLOWED_ORIGINS;
  return [
    ...new Set(
      configuredOrigins
        .map(normalizeOrigin)
        .filter((origin): origin is string => Boolean(origin)),
    ),
  ];
}

export function isAllowedOrigin(
  value: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const origin = normalizeOrigin(value);
  return Boolean(origin && getAllowedOrigins(env).includes(origin));
}

export function getFrontendOrigin(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const frontendOrigin = normalizeOrigin(env.FRONTEND_URL);
  if (frontendOrigin && isAllowedOrigin(frontendOrigin, env)) {
    return frontendOrigin;
  }

  if (isAllowedOrigin(DEFAULT_FRONTEND_ORIGIN, env)) {
    return DEFAULT_FRONTEND_ORIGIN;
  }

  const [fallback] = getAllowedOrigins(env);
  if (!fallback) {
    throw new Error('CORS_ORIGINS must include at least one valid origin');
  }
  return fallback;
}
