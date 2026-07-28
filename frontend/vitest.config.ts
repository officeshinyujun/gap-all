import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': alias('./'),
      '@shared': alias('./shared'),
      '@features': alias('./features'),
      '@entities': alias('./entities'),
      '@widgets': alias('./widgets'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: {
      modules: { classNameStrategy: 'non-scoped' },
    },
  },
});
