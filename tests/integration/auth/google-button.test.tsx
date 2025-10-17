import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

// Mock fetch
global.fetch = vi.fn()

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: '',
  },
  writable: true,
})

describe('Google Sign-In Button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetch).mockClear()
    // Reset environment
    delete process.env.NEXT_PUBLIC_GOOGLE_ENABLED
  })

  it('should render Google button when enabled', () => {
    process.env.NEXT_PUBLIC_GOOGLE_ENABLED = 'true'

    render(<GoogleSignInButton />)

    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('should not render when explicitly disabled', () => {
    process.env.NEXT_PUBLIC_GOOGLE_ENABLED = 'false'

    const { container } = render(<GoogleSignInButton />)

    expect(container.firstChild).toBeNull()
  })

  it('should render by default when not explicitly disabled', () => {
    // NEXT_PUBLIC_GOOGLE_ENABLED is undefined

    render(<GoogleSignInButton />)

    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
  })

  it('should handle Google sign-in click', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_ENABLED = 'true'

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      url: 'https://accounts.google.com/oauth/authorize?client_id=...',
    } as Response)

    render(<GoogleSignInButton />)

    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(fetch).toHaveBeenCalledWith('/api/auth/google', {
      method: 'POST',
    })

    // Should redirect to Google OAuth URL
    expect(window.location.href).toBe('https://accounts.google.com/oauth/authorize?client_id=...')
  })

  it('should show loading state during sign-in', () => {
    process.env.NEXT_PUBLIC_GOOGLE_ENABLED = 'true'

    render(<GoogleSignInButton />)

    const button = screen.getByRole('button')
    fireEvent.click(button)

    // Button should be disabled and show loading text
    expect(button).toBeDisabled()
    expect(screen.getByText('Signing in...')).toBeInTheDocument()
  })

  it('should handle sign-in failure', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_ENABLED = 'true'

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'OAuth provider not configured' }),
    } as Response)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<GoogleSignInButton />)

    const button = screen.getByRole('button')
    fireEvent.click(button)

    await new Promise(resolve => setTimeout(resolve, 0)) // Wait for async operations

    expect(consoleSpy).toHaveBeenCalledWith('Google sign-in failed:', 'OAuth provider not configured')

    consoleSpy.mockRestore()
  })
})
