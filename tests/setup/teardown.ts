/**
 * Worker teardown hooks to prevent memory accumulation.
 * 
 * This file registers cleanup hooks that run when workers are recycled:
 * 1. Clear jsdom DOM state (document, window)
 * 2. Clear timers and intervals
 * 3. Clear event listeners and storage
 * 4. Force GC in CI (if available)
 * 
 * With `vmMemoryLimit: 2GB`, workers are recycled after ~10-15 test files.
 * This hook runs during worker shutdown, ensuring cleanup before the next
 * worker starts with a fresh heap.
 * 
 * Combined with `sequence.hooks: 'stack'`, hooks unwind properly between
 * files, allowing GC to reclaim memory between worker cycles.
 */

import { afterAll } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * Reset jsdom DOM state between test files.
 * This prevents DOM nodes from accumulating across files.
 */
function resetDOM() {
  if (typeof document !== 'undefined' && document) {
    // Clear all DOM content
    if (document.body) {
      document.body.innerHTML = ''
    }
    if (document.head) {
      // Preserve essential head elements but clear test-specific content
      const essential = Array.from(document.head.children).filter(
        (el) => el.tagName === 'META' && el.getAttribute('charset')
      )
      document.head.innerHTML = ''
      essential.forEach((el) => document.head.appendChild(el))
    }
    
    // Clear any remaining event listeners by cloning and replacing
    // This is a safe way to remove all listeners without tracking them
    if (document.body && document.body.parentNode) {
      const newBody = document.body.cloneNode(false)
      document.body.parentNode?.replaceChild(newBody, document.body)
    }
  }
  
  // Clear window-level state that might accumulate
  if (typeof window !== 'undefined' && window) {
    // Clear any stored data
    try {
      if (window.localStorage) {
        window.localStorage.clear()
      }
      if (window.sessionStorage) {
        window.sessionStorage.clear()
      }
    } catch (e) {
      // Ignore storage errors (may not be available in all test contexts)
    }
    
    // Clear any intervals/timeouts that might be lingering
    // Note: This is aggressive but necessary for memory cleanup
    let highestId = setTimeout(() => {}, 0)
    for (let i = 0; i < highestId; i++) {
      clearTimeout(i)
      clearInterval(i)
    }
  }
}

/**
 * Clear React Testing Library state between files.
 */
function resetTestingLibrary() {
  // Cleanup any remaining React components
  try {
    cleanup()
  } catch (e) {
    // Ignore cleanup errors (may be called when nothing to clean)
  }
}

/**
 * Force garbage collection if available (CI only).
 * This is guarded behind process.env.CI to avoid affecting local dev performance.
 */
function forceGC() {
  if (process.env.CI === 'true' && typeof global.gc === 'function') {
    try {
      global.gc()
    } catch (e) {
      // Ignore GC errors
    }
  }
}

/**
 * Per-file teardown hook.
 * Runs after all tests in a file complete.
 */
afterAll(() => {
  // Reset DOM state
  resetDOM()
  
  // Reset Testing Library state
  resetTestingLibrary()
  
  // Force GC in CI (if available)
  forceGC()
})

