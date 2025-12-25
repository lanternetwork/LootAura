/**
 * Empty stub module for test isolation experiments
 * Exports no-op functions and empty types to prevent background workers/monitoring
 */

// No-op exports - these do nothing and create no handles
export function noop() {}
export function asyncNoop() { return Promise.resolve() }
export const emptyObject = {}
export const emptyArray: any[] = []

