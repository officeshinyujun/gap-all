import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const alias = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['macbookpro.tailc5a2a5.ts.net'],
  },
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  resolve: {
    alias: {
      '@': alias('./'),
      '@shared': alias('./shared'),
      '@features': alias('./features'),
      '@entities': alias('./entities'),
      '@widgets': alias('./widgets'),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: '@use "@/styles/variables.scss" as *;',
      },
    },
  },
});
