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
    testTimeout: 30000,
    hookTimeout: 30000,
    // Use forks instead of threads for better memory isolation
    // Each fork gets its own heap and inherits NODE_OPTIONS properly
    pool: 'forks',
    poolOptions: {
      forks: {
        // Ensure forked workers keep the same heap cap as the parent test process in CI.
        execArgv: ['--max-old-space-size=8192'],
      },
    },
    sequence: {
      shuffle: false,
      concurrent: false,
    },
    // Reduce memory usage
    maxConcurrency: 1,
    maxWorkers: isCI ? 1 : 2,
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
