import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

// Mock Supabase client
const mockSignInWithOAuth = vi.fn()
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({
    auth: {
      signInWithOAuth: mockSignInWithOAuth
    }
  }))
}))

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: '',
    origin: 'https://example.com'
  },
  writable: true,
})

describe('Google Sign-In Button', () => {
  beforeEach(() => {
    // Clear mocks before each test
    vi.clearAllMocks()
    mockSignInWithOAuth.mockClear()
    // Reset environment
    delete process.env.NEXT_PUBLIC_GOOGLE_ENABLED
  })

  afterEach(() => {
    // Clean up mocks and reset state
    cleanup()
    vi.clearAllMocks()
  })

  it('should render Google button when enabled', () => {
    process.env.NEXT_PUBLIC_GOOGLE_ENABLED = 'true'

    render(<GoogleSignInButton />)

    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
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

    mockSignInWithOAuth.mockResolvedValueOnce({ error: null })

    render(<GoogleSignInButton />)

    const button = screen.getByRole('button', { name: 'Continue with Google' })
    fireEvent.click(button)

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://example.com/auth/callback',
        queryParams: { 
          prompt: 'select_account'
        }
      }
    })
  })

  it('should show loading state during sign-in', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_ENABLED = 'true'

    // Mock a slow response
    mockSignInWithOAuth.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ error: null }), 100))
    )

    render(<GoogleSignInButton />)

    const button = screen.getByRole('button', { name: 'Continue with Google' })
    fireEvent.click(button)

    // Button should be disabled and show loading text
    expect(button).toBeDisabled()
    expect(screen.getByText('Signing in...')).toBeInTheDocument()
  })

  it('should handle sign-in failure', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_ENABLED = 'true'

    mockSignInWithOAuth.mockResolvedValueOnce({
      error: { message: 'OAuth provider not configured' }
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<GoogleSignInButton />)

    const button = screen.getByRole('button', { name: 'Continue with Google' })
    fireEvent.click(button)

    await new Promise(resolve => setTimeout(resolve, 0)) // Wait for async operations

    expect(consoleSpy).toHaveBeenCalledWith('[GOOGLE_AUTH] Google sign-in failed:', 'OAuth provider not configured')

    consoleSpy.mockRestore()
  })
})
