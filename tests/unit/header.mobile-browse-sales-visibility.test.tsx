/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Header } from '@/app/Header'

const mockUsePathname = vi.fn()
const mockSearchParamsGet = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParamsGet(key),
  }),
}))

vi.mock('@/components/UserProfile', () => ({
  default: () => <div data-testid="user-profile">User Profile</div>,
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    },
  }),
}))

function getMobileNavCluster(): HTMLElement {
  const favoritesLinks = screen.getAllByLabelText('Favorites')
  for (const favorites of favoritesLinks) {
    const cluster = favorites.closest('div')
    if (
      cluster?.className.includes('sm:hidden') &&
      !cluster.className.includes('sm:flex')
    ) {
      return cluster as HTMLElement
    }
  }
  throw new Error('Mobile nav cluster not found')
}

describe('Header mobile Browse Sales visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsGet.mockReturnValue(null)
  })

  it('hides mobile Browse Sales map-pin on /sales', () => {
    mockUsePathname.mockReturnValue('/sales')
    render(<Header />)

    const mobileNav = getMobileNavCluster()
    expect(within(mobileNav).queryByLabelText('Browse Sales')).not.toBeInTheDocument()
    expect(within(mobileNav).getByLabelText('Favorites')).toBeInTheDocument()
    expect(screen.getAllByText('Browse Sales').length).toBeGreaterThan(0)
  })

  it('shows mobile Browse Sales map-pin on sale detail', () => {
    mockUsePathname.mockReturnValue('/sales/abc-def-123')
    render(<Header />)

    const mobileNav = getMobileNavCluster()
    const link = within(mobileNav).getByLabelText('Browse Sales')
    expect(link).toHaveAttribute('href', '/sales')
  })

  it('shows mobile Browse Sales map-pin off the map', () => {
    mockUsePathname.mockReturnValue('/')
    render(<Header />)

    const mobileNav = getMobileNavCluster()
    const link = within(mobileNav).getByLabelText('Browse Sales')
    expect(link).toHaveAttribute('href', '/sales')
  })

  it('keeps desktop Browse Sales text visible on /sales', () => {
    mockUsePathname.mockReturnValue('/sales')
    render(<Header />)

    expect(screen.getAllByText('Browse Sales').length).toBeGreaterThan(0)
  })
})
