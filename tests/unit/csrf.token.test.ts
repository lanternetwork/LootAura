/**
 * Unit tests for CSRF token generation
 * 
 * Verifies that token generation:
 * 1. Produces non-empty tokens
 * 2. Maintains stable length (64 hex characters = 32 bytes)
 * 3. Generates URL/cookie-safe tokens (hex characters only)
 * 4. Works in Edge runtime (uses Web Crypto API)
 */

import { describe, it, expect } from 'vitest'
import { generateCsrfToken } from '@/lib/csrf'

describe('CSRF Token Generation', () => {
  it('generates non-empty tokens', () => {
    const token = generateCsrfToken()
    expect(token).toBeTruthy()
    expect(token.length).toBeGreaterThan(0)
  })

  it('generates tokens with stable length (64 hex characters)', () => {
    // Generate multiple tokens to ensure consistent length
    const tokens = Array.from({ length: 10 }, () => generateCsrfToken())
    
    // All tokens should be exactly 64 characters (32 bytes * 2 hex chars per byte)
    tokens.forEach(token => {
      expect(token.length).toBe(64)
    })
    
    // All tokens should have the same length
    const lengths = new Set(tokens.map(t => t.length))
    expect(lengths.size).toBe(1)
    expect(lengths.has(64)).toBe(true)
  })

  it('generates URL/cookie-safe tokens (hex characters only)', () => {
    const tokens = Array.from({ length: 20 }, () => generateCsrfToken())
    
    // Hex characters: 0-9, a-f
    const hexPattern = /^[0-9a-f]+$/
    
    tokens.forEach(token => {
      expect(token).toMatch(hexPattern)
      // Verify no special characters that could break URLs or cookies
      expect(token).not.toMatch(/[^0-9a-f]/)
    })
  })

  it('generates unique tokens', () => {
    // Generate many tokens to check for uniqueness
    const tokens = Array.from({ length: 100 }, () => generateCsrfToken())
    const uniqueTokens = new Set(tokens)
    
    // With 32 bytes of entropy, collisions should be extremely rare
    // If we get a collision in 100 tokens, something is wrong
    expect(uniqueTokens.size).toBe(tokens.length)
  })

  it('uses Web Crypto API (Edge-compatible)', () => {
    // Verify that globalThis.crypto is available (Web Crypto API)
    expect(globalThis.crypto).toBeDefined()
    expect(globalThis.crypto.getRandomValues).toBeDefined()
    expect(typeof globalThis.crypto.getRandomValues).toBe('function')
    
    // Token generation should work without Node crypto
    const token = generateCsrfToken()
    expect(token).toBeTruthy()
    expect(token.length).toBe(64)
  })
})
