import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node', // Use node for unit/integration tests (MSW works in node)
    setupFiles: [
      path.resolve(__dirname, 'tests/setup/index.ts'),
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
    // Memory optimization settings
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true, // Enable isolation for proper module reset
      },
    },
    // Reduce memory usage
    maxConcurrency: 1,
    // Constrain worker count to prevent OOMs
    maxWorkers: 4,
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
