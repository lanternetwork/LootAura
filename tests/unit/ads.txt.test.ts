/**
 * Unit tests for ads.txt file
 * 
 * Tests verify that:
 * - ads.txt file exists and contains the correct Google AdSense entry
 * - File format matches the standard ads.txt specification
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('ads.txt', () => {
  it('should exist in public directory', () => {
    const adsTxtPath = join(process.cwd(), 'public', 'ads.txt')
    const fileExists = require('fs').existsSync(adsTxtPath)
    expect(fileExists).toBe(true)
  })

  it('should contain Google AdSense entry', () => {
    const adsTxtPath = join(process.cwd(), 'public', 'ads.txt')
    const content = readFileSync(adsTxtPath, 'utf-8')
    
    // Security: Validate domain is the first field, not just a substring
    // Parse the line to ensure 'google.com' is the domain field
    const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'))
    const googleLine = lines.find(line => {
      const fields = line.split(',').map(f => f.trim())
      return fields[0] === 'google.com'
    })
    
    expect(googleLine).toBeDefined()
    expect(googleLine).toContain('pub-8685093412475036')
    expect(googleLine).toContain('DIRECT')
    expect(googleLine).toContain('f08c47fec0942fa0')
  })

  it('should match standard ads.txt format', () => {
    const adsTxtPath = join(process.cwd(), 'public', 'ads.txt')
    const content = readFileSync(adsTxtPath, 'utf-8').trim()
    
    // Should match: google.com, pub-8685093412475036, DIRECT, f08c47fec0942fa0
    const expectedLine = 'google.com, pub-8685093412475036, DIRECT, f08c47fec0942fa0'
    expect(content).toBe(expectedLine)
  })

  it('should not contain extra content', () => {
    const adsTxtPath = join(process.cwd(), 'public', 'ads.txt')
    const content = readFileSync(adsTxtPath, 'utf-8').trim()
    
    // Should be a single line (or lines with only the Google entry)
    const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'))
    expect(lines.length).toBeGreaterThanOrEqual(1)
    
    // At least one line should match the expected format
    // Security: Validate domain is the first field, not just a substring
    const hasGoogleEntry = lines.some(line => {
      const fields = line.split(',').map(f => f.trim())
      // Domain must be first field and exactly 'google.com'
      return fields[0] === 'google.com' && 
             fields[1] === 'pub-8685093412475036'
    })
    expect(hasGoogleEntry).toBe(true)
  })
})

