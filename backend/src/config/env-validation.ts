export function validateEnv() {
  const requiredEnvVars = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'DB_PROVIDER',
  ] as const;

  const missingEnvVars: string[] = requiredEnvVars.filter((key) => !process.env[key]);

  // DB_PROVIDER에 따라 적절한 DATABASE URL 변수 검증
  const dbProvider = process.env.DB_PROVIDER || 'local';
  if (dbProvider === 'supabase') {
    if (!process.env.DATABASE_SUPABASE_URL) {
      missingEnvVars.push('DATABASE_SUPABASE_URL');
    }
  } else {
    if (!process.env.DATABASE_LOCAL_URL) {
      missingEnvVars.push('DATABASE_LOCAL_URL');
    }
  }

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingEnvVars.join(', ')}`,
    );
  }

  // 운영 환경에서는 취약한 기본값이나 짧은 키 사용 방지 (최소 32자)
  if (process.env.NODE_ENV === 'production') {
    const accessSecret = process.env.JWT_ACCESS_SECRET || '';
    const refreshSecret = process.env.JWT_REFRESH_SECRET || '';
    if (accessSecret.length < 32 || refreshSecret.length < 32) {
      throw new Error(
        'In production, JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be at least 32 characters long for security.',
      );
    }
  }
}
