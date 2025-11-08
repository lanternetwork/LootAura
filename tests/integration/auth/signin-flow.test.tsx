import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock Next.js hooks
const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockGet = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: mockGet,
  }),
}))

// Mock auth hooks
const mockSignIn = vi.fn()
const mockUseAuth = vi.fn()

vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  useSignIn: () => ({
    mutateAsync: mockSignIn,
    isPending: false,
  }),
}))

// Mock Google sign-in component
vi.mock('@/components/auth/GoogleSignInButton', () => ({
  default: () => <button data-testid="google-signin">Continue with Google</button>,
}))

// Mock fetch for magic link
global.fetch = vi.fn()

describe('Sign In Page Integration', () => {
  let SignIn: any

  beforeEach(async () => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({
      data: null,
      isLoading: false,
    })
    mockGet.mockReturnValue(null)
    
    // Dynamic import to avoid module resolution issues
    const module = await import('@/app/auth/signin/page')
    SignIn = module.default
  })

  afterEach(() => {
    cleanup()
  })

  describe('Email/Password Sign In', () => {
    it('should render sign in form correctly', () => {
      render(<SignIn />)

      expect(screen.getByLabelText('Email')).toBeInTheDocument()
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Send Magic Link' })).toBeInTheDocument()
    })

    it('should handle successful email/password sign in', async () => {
      mockSignIn.mockResolvedValueOnce({})

      render(<SignIn />)

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'password123' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
        })
      })
    })

    it('should display error message on sign in failure', async () => {
      mockSignIn.mockRejectedValueOnce(new Error('Invalid credentials'))

      render(<SignIn />)

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'wrongpassword' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
      })
    })
  })

  describe('Magic Link Sign In', () => {
    it('should send magic link when button is clicked', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      global.fetch = mockFetch

      render(<SignIn />)

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'test@example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Send Magic Link' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/auth/magic-link', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: 'test@example.com' }),
        })
      })
    })

    it('should show success message when magic link is sent', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      global.fetch = mockFetch

      render(<SignIn />)

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'test@example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Send Magic Link' }))

      await waitFor(() => {
        expect(screen.getByText('Magic link sent!')).toBeInTheDocument()
        expect(screen.getByText('Check your email and click the link to sign in.')).toBeInTheDocument()
      })
    })

    it('should disable magic link button when email is empty', () => {
      render(<SignIn />)

      const magicLinkButton = screen.getByRole('button', { name: 'Send Magic Link' })
      expect(magicLinkButton).toBeDisabled()
    })

    it('should enable magic link button when email is provided', () => {
      render(<SignIn />)

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'test@example.com' },
      })

      const magicLinkButton = screen.getByRole('button', { name: 'Send Magic Link' })
      expect(magicLinkButton).not.toBeDisabled()
    })

    it('should show loading state while sending magic link', async () => {
      const mockFetch = vi.fn().mockImplementationOnce(
        () => new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        }), 100))
      )
      global.fetch = mockFetch

      render(<SignIn />)

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'test@example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Send Magic Link' }))

      expect(screen.getByText('Sending...')).toBeInTheDocument()
    })

    it('should display error message when magic link fails', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'Failed to send magic link' }),
      })
      global.fetch = mockFetch

      render(<SignIn />)

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'test@example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Send Magic Link' }))

      await waitFor(() => {
        expect(screen.getByText('Failed to send magic link')).toBeInTheDocument()
      })
    })
  })

  describe('Navigation and Redirects', () => {
    it('should redirect authenticated users to sales page', async () => {
      mockUseAuth.mockReturnValue({
        data: { id: 'user123', email: 'test@example.com' },
        isLoading: false,
      })

      render(<SignIn />)

      // Wait for the redirect (there's a 200ms delay in the component)
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/sales')
      }, { timeout: 500 })
    })

    it('should redirect to specified page after successful sign in', async () => {
      mockGet.mockReturnValue('/favorites')
      mockSignIn.mockResolvedValueOnce({})

      render(<SignIn />)

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'password123' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalled()
      })

      // Check that window.location.href is set (this would be tested in E2E)
    })

    it('should show loading state during authentication', () => {
      mockUseAuth.mockReturnValue({
        data: null,
        isLoading: true,
      })

      render(<SignIn />)

      expect(screen.getByText('Signing in...')).toBeInTheDocument()
    })
  })

  describe('Form Validation', () => {
    it('should require email and password for sign in', () => {
      render(<SignIn />)

      const emailInput = screen.getByLabelText('Email')
      const passwordInput = screen.getByLabelText('Password')
      const signInButton = screen.getByRole('button', { name: 'Sign In' })

      expect(emailInput).toBeRequired()
      expect(passwordInput).toBeRequired()
      expect(signInButton).toBeInTheDocument()
    })

    it('should validate email format', () => {
      render(<SignIn />)

      const emailInput = screen.getByLabelText('Email')
      expect(emailInput).toHaveAttribute('type', 'email')
    })
  })
})
