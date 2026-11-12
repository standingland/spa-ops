import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/db/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
