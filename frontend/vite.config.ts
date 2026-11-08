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
  // PDF 내보내기(시험지 HTML 생성)가 동적으로 불러오는 의존성. 미리 묶어 두지 않으면 처음 누를 때 개발 서버가 페이지를 새로고침한다.
  optimizeDeps: {
    include: ['react-dom/server'],
  },
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
