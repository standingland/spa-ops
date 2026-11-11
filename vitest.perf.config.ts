import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/perf/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 600000,
    hookTimeout: 900000,
  },
});
