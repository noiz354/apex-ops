import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3157);
const CHANNEL = process.env.E2E_CHANNEL as 'chrome' | undefined;

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // one seeded DB; serial execution keeps journeys deterministic
  workers: 1,
  retries: 0, // flake detection: a green harness must pass twice in a row
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    ...(CHANNEL ? { channel: CHANNEL } : {}),
    ...devices['Desktop Chrome'],
  },
  webServer: process.env.E2E_NO_SERVER ? undefined : {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
    cwd: '..', // config lives in e2e/; the Next.js project root is one level up
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
