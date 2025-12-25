import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

const isCI = process.env.CI === 'true'

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
    // Ensure jsdom environment is available to tests
    // In CI, avoid 'forks' because child_process IPC pipes/sockets can keep the event loop alive
    // and cause the Vitest process to hang after tests complete. Use a single-threaded pool instead.
    // Locally, keep 'forks' to preserve existing behavior and NODE_OPTIONS inheritance.
    pool: isCI ? 'threads' : 'forks',
    // Explicitly pass heap size to fork workers via execArgv to ensure it's applied
    // This is critical for CI where tests can consume significant memory
    poolOptions: {
      forks: {
        // Parse NODE_OPTIONS from environment and pass as execArgv to ensure heap size is applied
        // Fallback to 20GB for CI if NODE_OPTIONS is not set
        execArgv: (() => {
          const nodeOptions = process.env.NODE_OPTIONS
          if (nodeOptions) {
            // Split by spaces and filter out empty strings
            return nodeOptions.split(/\s+/).filter(Boolean)
          }
          // Default to 20GB heap for CI if NODE_OPTIONS not set
          return process.env.CI ? ['--max-old-space-size=20480', '--expose-gc'] : []
        })(),
      },
      threads: {
        // In CI, run tests in a single thread to avoid additional worker IPC and keep behavior stable
        singleThread: isCI,
      },
    },
    // Reduce memory usage
    maxConcurrency: 1,
    // Constrain worker count to prevent OOMs (use 1 worker in CI to reduce memory pressure)
    maxWorkers: 1,
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
