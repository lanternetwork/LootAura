import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FeaturedSalesSection } from '@/components/landing/FeaturedSalesSection'
import * as flagsModule from '@/lib/flags'

// Mock the flags module
vi.mock('@/lib/flags', () => ({
  isTestSalesEnabled: vi.fn(() => false),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

// Mock fetch
global.fetch = vi.fn()

describe('FeaturedSalesSection with demo sales', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset default mock to return false
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(false)
  })

  it('shows demo sales when flag is enabled', async () => {
    // Enable the flag
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(true)

    // Mock fetch to return empty array (no real sales)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sales: [] }),
    })

    render(<FeaturedSalesSection />)

    // Wait for component to render and check for demo sales
    await waitFor(
      () => {
        const demoBadges = screen.queryAllByText('Demo')
        expect(demoBadges.length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })

  it('does not show demo sales when flag is disabled', async () => {
    // Disable the flag
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(false)

    // Mock fetch to return empty array
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sales: [] }),
    })

    render(<FeaturedSalesSection />)

    // Wait for component to render
    await waitFor(
      () => {
        // Should not show demo badges when flag is disabled
        const demoBadges = screen.queryAllByText('Demo')
        expect(demoBadges.length).toBe(0)
      },
      { timeout: 3000 }
    )
  })

  it('shows demo badge on demo sale cards', async () => {
    // Enable the flag
    vi.mocked(flagsModule.isTestSalesEnabled).mockReturnValue(true)

    // Mock fetch to return empty array
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sales: [] }),
    })

    render(<FeaturedSalesSection />)

    // Wait for demo sales to appear
    await waitFor(
      () => {
        // Should find demo sale titles
        const demoTitle1 = screen.queryByText(/Demo: Neighborhood Yard Sale/i)
        const demoTitle2 = screen.queryByText(/Demo: Multi-family Sale/i)
        expect(demoTitle1 || demoTitle2).toBeTruthy()

        // Should show demo badges
        const demoBadges = screen.queryAllByText('Demo')
        expect(demoBadges.length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })
})

