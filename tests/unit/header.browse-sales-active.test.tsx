/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

function getBrowseSalesNavLinks(): HTMLAnchorElement[] {
  return screen.getAllByRole('link', { name: 'Browse Sales' }) as HTMLAnchorElement[]
}

function getBrowseSalesTextLink(): HTMLAnchorElement {
  const text = screen.getAllByText('Browse Sales')[0]
  const link = text.closest('a')
  if (!link) throw new Error('Browse Sales text link not found')
  return link
}

describe('Header Browse Sales active state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParamsGet.mockReturnValue(null)
  })

  it.each([
    ['/sales', true],
    ['/sales/abc-def-123', true],
  ])('marks Browse Sales active on %s', (pathname, active) => {
    mockUsePathname.mockReturnValue(pathname)
    render(<Header />)

    const iconLinks = getBrowseSalesNavLinks()
    expect(iconLinks.length).toBe(2)

    for (const link of iconLinks) {
      expect(link).toHaveAttribute('href', '/sales')
      if (active) {
        expect(link).toHaveAttribute('aria-current', 'page')
        expect(link.className).toContain('border-[#3A2268]')
      } else {
        expect(link).not.toHaveAttribute('aria-current')
      }
    }

    const textLink = getBrowseSalesTextLink()
    expect(textLink).toHaveAttribute('href', '/sales')
    if (active) {
      expect(textLink).toHaveAttribute('aria-current', 'page')
      expect(textLink.className).toContain('font-semibold')
    } else {
      expect(textLink).not.toHaveAttribute('aria-current')
      expect(textLink.className).not.toContain('font-semibold')
    }
  })

  it.each([
    ['/', false],
    ['/sell/new', false],
    ['/account', false],
  ])('marks Browse Sales inactive on %s', (pathname, active) => {
    mockUsePathname.mockReturnValue(pathname)
    render(<Header />)

    for (const link of getBrowseSalesNavLinks()) {
      expect(link).not.toHaveAttribute('aria-current')
      expect(link.className).not.toContain('border-[#3A2268]')
    }

    const textLink = getBrowseSalesTextLink()
    expect(textLink).not.toHaveAttribute('aria-current')
    expect(textLink.className).not.toContain('font-semibold')
  })
})
