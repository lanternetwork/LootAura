import { describe, it, expect } from 'vitest'
import { normalizeIngestionCity, normalizeIngestionState } from '@/lib/ingestion/normalizeIngestionLocation'

describe('normalizeIngestionCity', () => {
  it('returns null for null/empty', () => {
    expect(normalizeIngestionCity(null)).toBeNull()
    expect(normalizeIngestionCity('')).toBeNull()
    expect(normalizeIngestionCity('   ')).toBeNull()
  })

  it('title-cases lowercase and multi-word', () => {
    expect(normalizeIngestionCity('orland park')).toBe('Orland Park')
    expect(normalizeIngestionCity('DOWNERS GROVE')).toBe('Downers Grove')
  })

  it('title-cases mixed-case', () => {
    expect(normalizeIngestionCity('oRlAnD pArK')).toBe('Orland Park')
  })

  it('collapses whitespace', () => {
    expect(normalizeIngestionCity('  new   york  ')).toBe('New York')
  })
})

describe('normalizeIngestionState', () => {
  it('returns null for null/empty', () => {
    expect(normalizeIngestionState(null)).toBeNull()
    expect(normalizeIngestionState('')).toBeNull()
  })

  it('uppercases 2-letter abbreviations', () => {
    expect(normalizeIngestionState('il')).toBe('IL')
    expect(normalizeIngestionState('In')).toBe('IN')
    expect(normalizeIngestionState('CA')).toBe('CA')
  })

  it('maps full state names', () => {
    expect(normalizeIngestionState('Illinois')).toBe('IL')
    expect(normalizeIngestionState('new york')).toBe('NY')
    expect(normalizeIngestionState('District of Columbia')).toBe('DC')
    expect(normalizeIngestionState('north carolina')).toBe('NC')
  })

  it('strips noise for lookup (abbrev with suffix / usa)', () => {
    expect(normalizeIngestionState('il usa')).toBe('IL')
    expect(normalizeIngestionState('Illinois.')).toBe('IL')
  })
})
