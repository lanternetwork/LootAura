import React, { useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

// Hoist mocks before importing the component under test
vi.mock('@/lib/geocode', () => ({
  geocodeAddress: vi.fn(),
  fetchSuggestions: vi.fn(),
  fetchOverpassAddresses: vi.fn(),
}))

vi.mock('@/lib/providers/googlePlaces', () => ({
  googleAutocomplete: vi.fn(() => {
    throw new Error('googleAutocomplete should not be called in this test')
  }),
  googlePlaceDetails: vi.fn(() => {
    throw new Error('googlePlaceDetails should not be called in this test')
  }),
}))

import AddressAutocomplete from '@/components/location/AddressAutocomplete'
import { fetchSuggestions, geocodeAddress } from '@/lib/geocode'

function Harness(props: { userLat?: number; userLng?: number }) {
  const [value, setValue] = useState('')
  return (
    <AddressAutocomplete
      value={value}
      onChange={setValue}
      onPlaceSelected={vi.fn()}
      userLat={props.userLat}
      userLng={props.userLng}
    />
  )
}

describe('AddressAutocomplete (committed selection)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()

    vi.mocked(fetchSuggestions).mockResolvedValue([
      {
        id: 'osm:1',
        label: '123 Main St, Louisville, KY',
        lat: 38.25,
        lng: -85.75,
        address: { line1: '123 Main St', city: 'Louisville', state: 'KY', postcode: '40201' },
      },
    ] as any)

    vi.mocked(geocodeAddress).mockResolvedValue(null as any)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('does not refetch or geocode after selecting a suggestion (even when coords arrive later)', async () => {
    const { rerender } = render(<Harness />)

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: '123 ma' } })

    // Allow debounce to trigger fetch
    vi.advanceTimersByTime(300)

    await waitFor(() => {
      expect(fetchSuggestions).toHaveBeenCalledTimes(1)
    })

    const option = await screen.findByRole('option', { name: /123 main st/i })
    fireEvent.mouseDown(option)

    // Selection clears and commits; allow the guard timeout scheduling to settle
    vi.advanceTimersByTime(10)

    await waitFor(() => {
      expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('123 Main St')
    })

    // Simulate late-arriving coords from parent props
    rerender(<Harness userLat={38.25} userLng={-85.75} />)
    vi.advanceTimersByTime(500)

    expect(fetchSuggestions).toHaveBeenCalledTimes(1)

    // Blur should not geocode a committed selection
    fireEvent.blur(screen.getByRole('combobox'))
    vi.advanceTimersByTime(300)
    expect(geocodeAddress).not.toHaveBeenCalled()
  })
})


