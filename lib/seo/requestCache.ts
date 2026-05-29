import { cache as reactCache } from 'react'

/** Next.js request cache in production; identity wrapper in Vitest/non-RSC contexts. */
export const requestCache =
  typeof reactCache === 'function'
    ? reactCache
    : <T extends (...args: never[]) => unknown>(fn: T): T => fn
