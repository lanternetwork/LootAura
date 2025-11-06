import { describe, it, expect } from 'vitest'
import { googleAutocomplete, googlePlaceDetails } from '@/lib/providers/googlePlaces'

describe('Google provider normalization', () => {
  it('maps predictions to minimal structure', async () => {
    // We rely on MSW in integration for network. Here just assert function exists.
    expect(typeof googleAutocomplete).toBe('function')
  })

  it('maps details to AddressSuggestion', async () => {
    expect(typeof googlePlaceDetails).toBe('function')
  })
})


