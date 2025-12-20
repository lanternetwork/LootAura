import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: [
      path.resolve(__dirname, 'tests/setup/msw.server.ts'),
      path.resolve(__dirname, 'tests/setup.ts'),
    ],
    globals: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/tests/e2e/**', // Exclude Playwright E2E tests
    ],
    // Ensure no network calls in tests
    testTimeout: 10000,
    hookTimeout: 10000,
    // Use forks instead of threads for better memory isolation in CI
    // Forks provide separate processes with independent memory spaces and better GC
    pool: process.env.CI ? 'forks' : 'threads',
    // Reduce memory usage
    maxConcurrency: 1,
    // Constrain worker count to prevent OOMs
    // Reduced to 1 for CI stability to minimize memory usage (can be overridden with VITEST_WORKERS env var)
    maxWorkers: process.env.CI ? 1 : 4,
    minWorkers: 1,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  define: {
    // Ensure proper environment for tests
    'process.env.NODE_ENV': '"test"',
  },
})
