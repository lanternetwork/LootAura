import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

const isCI = process.env.CI === 'true'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: isCI
      ? [
          path.resolve(__dirname, 'tests/setup/msw.server.ts'),
          path.resolve(__dirname, 'tests/setup.ts'),
          path.resolve(__dirname, 'tests/setup.node.ts'),
          path.resolve(__dirname, 'tests/setup/teardown.ts'),
        ]
      : [
          path.resolve(__dirname, 'tests/setup/msw.server.ts'),
          path.resolve(__dirname, 'tests/setup.ts'),
          path.resolve(__dirname, 'tests/setup/teardown.ts'),
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
    // Prevent cross-file global/mock leakage in CI while keeping local runs faster.
    isolate: isCI ? true : false,
    // Use forks instead of threads for better memory isolation
    // Each fork gets its own heap and inherits NODE_OPTIONS properly
    pool: 'forks',
    poolOptions: {
      forks: {
        // Ensure forked workers keep the same heap cap as the parent test process in CI.
        execArgv: ['--max-old-space-size=8192'],
      },
    },
    // Reduce memory usage
    maxConcurrency: 1,
    // Use two workers in CI to avoid single-worker memory accumulation.
    maxWorkers: isCI ? 2 : 2,
    minWorkers: 1,
    // Avoid spawning extra file workers that can still crash under CI memory pressure.
    fileParallelism: false,
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
