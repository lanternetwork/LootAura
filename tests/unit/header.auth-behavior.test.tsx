import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import '@testing-library/jest-dom'

import { Header } from '@/app/Header'

const mockUseAuth = vi.fn()
const mockUseProfile = vi.fn()
const mockUseSignOut = vi.fn()

vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  useProfile: () => mockUseProfile(),
  useSignOut: () => mockUseSignOut(),
}))

describe('Header auth behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not fall back to "Sign In" after delayed auth resolution', async () => {
    vi.useFakeTimers()

    // Simulate initial loading state with no user
    mockUseAuth.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
    })
    mockUseProfile.mockReturnValue({
      data: null,
      isLoading: true,
    })
    mockUseSignOut.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    })

    const { rerender } = render(<Header />)

    // While loading, we should see the loading indicator, not "Sign In"
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Sign In')).not.toBeInTheDocument()

    // Advance timers to simulate slow auth without triggering any timeout-based fallback
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    // Now simulate auth resolution with a logged-in user
    mockUseAuth.mockReturnValue({
      data: { id: 'user-123', email: 'test@example.com' },
      isLoading: false,
      isError: false,
    })
    mockUseProfile.mockReturnValue({
      data: { display_name: 'Test User' },
      isLoading: false,
    })
    mockUseSignOut.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    })

    rerender(<Header />)

    // After auth resolves, the profile UI should render, not the "Sign In" button
    expect(screen.queryByText('Sign In')).not.toBeInTheDocument()
    expect(screen.getByText('Test User')).toBeInTheDocument()
  })
})

