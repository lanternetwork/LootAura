import { setupServer } from 'msw/node'
import { beforeAll, afterEach, afterAll } from 'vitest'

// Create MSW server with default passthrough unless a handler exists
export const server = setupServer()

// Setup lifecycle hooks
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

