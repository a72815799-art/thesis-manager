import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' : 정적 파일을 어느 경로에 올려도 동작하도록 상대 경로 사용
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
