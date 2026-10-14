import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const baseURL = process.env.TEST_BASE_URL || `http://127.0.0.1:${process.env.TEST_PORT || '4319'}`;

export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', fullyParallel: false, workers: 1,
  use: { baseURL, channel: 'msedge', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: process.env.TEST_BASE_URL ? undefined : {
    command: 'npm run start', url: `${baseURL}/api/health`, reuseExistingServer: false, timeout: 60000,
    env: {
      HOST: '127.0.0.1', PORT: new URL(baseURL).port, NODE_ENV: 'test',
      AGENT_MODE: 'local', MAIL_MODE: 'capture', DATA_DIR: `.data/browser-${randomUUID()}`,
      APP_PASSWORD: '', PUBLIC_ORIGIN: '', MCP_TOKEN: 'isolated-browser-test-token-not-for-production', SEED_EXAMPLES: 'true',
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  reporter: [['list']], outputDir: 'test-results',
});
