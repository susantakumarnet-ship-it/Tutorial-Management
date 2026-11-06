import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export const TEST_DB_PORT = 5434;

export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.ts'],
    testTimeout: 30000,
    hookTimeout: 180000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: `postgres://postgres:postgres@localhost:${TEST_DB_PORT}/smart_tuition_test`,
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789-abcdefghijkl',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789-abcdefghijk',
      OTP_PEPPER: 'test-pepper',
      OTP_DEV_MODE: 'true',
      UPLOAD_DIR: path.join(os.tmpdir(), 'smart-tuition-test-uploads'),
    },
  },
});
