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
}
