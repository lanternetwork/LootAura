import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, // Reduce retries
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30 * 1000, // 30 seconds per test
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    // Only run Chrome in CI to speed up tests
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Only run other browsers in non-CI environments
    ...(process.env.CI ? [] : [
      {
        name: 'firefox',
        use: { ...devices['Desktop Firefox'] },
      },
      {
        name: 'webkit',
        use: { ...devices['Desktop Safari'] },
      },
    ]),
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000, // 3 minutes timeout
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      INTENT_ENABLED: '1',
      NEXT_PUBLIC_FEATURE_CLUSTERING: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://mock-supabase-url.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key',
    },
  },
})
