import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    // Integration tests share a live MySQL instance, so they must NOT run in
    // parallel: concurrent DDL (CREATE/DROP TABLE, ALTER TABLE) from different
    // test files causes non-deterministic failures. singleFork serialises all
    // test files in one worker process, eliminating cross-file race conditions.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
