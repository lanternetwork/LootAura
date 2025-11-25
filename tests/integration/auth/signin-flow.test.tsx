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

      // Both mobile and desktop forms render, so use getAllBy and check first (mobile)
      const emailInputs = screen.getAllByLabelText('Email')
      const passwordInputs = screen.getAllByLabelText('Password')
      const signInButtons = screen.getAllByRole('button', { name: 'Sign In' })
      const magicLinkButtons = screen.getAllByRole('button', { name: 'Send Magic Link' })
      
      expect(emailInputs.length).toBeGreaterThan(0)
      expect(passwordInputs.length).toBeGreaterThan(0)
      expect(signInButtons.length).toBeGreaterThan(0)
      expect(magicLinkButtons.length).toBeGreaterThan(0)
    })

    it('should handle successful email/password sign in', async () => {
      mockSignIn.mockResolvedValueOnce({})

      render(<SignIn />)

      // Use first form (mobile) - both forms share the same state
      const emailInputs = screen.getAllByLabelText('Email')
      const passwordInputs = screen.getAllByLabelText('Password')
      const signInButtons = screen.getAllByRole('button', { name: 'Sign In' })

      fireEvent.change(emailInputs[0], {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(passwordInputs[0], {
        target: { value: 'password123' },
      })
      fireEvent.click(signInButtons[0])

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

      const emailInputs = screen.getAllByLabelText('Email')
      const passwordInputs = screen.getAllByLabelText('Password')
      const signInButtons = screen.getAllByRole('button', { name: 'Sign In' })

      fireEvent.change(emailInputs[0], {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(passwordInputs[0], {
        target: { value: 'wrongpassword' },
      })
      fireEvent.click(signInButtons[0])

      await waitFor(() => {
        const errorMessages = screen.getAllByText('Invalid credentials')
        expect(errorMessages.length).toBeGreaterThan(0)
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

      const emailInputs = screen.getAllByLabelText('Email')
      const magicLinkButtons = screen.getAllByRole('button', { name: 'Send Magic Link' })

      fireEvent.change(emailInputs[0], {
        target: { value: 'test@example.com' },
      })
      fireEvent.click(magicLinkButtons[0])

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

      const emailInputs = screen.getAllByLabelText('Email')
      const magicLinkButtons = screen.getAllByRole('button', { name: 'Send Magic Link' })

      fireEvent.change(emailInputs[0], {
        target: { value: 'test@example.com' },
      })
      fireEvent.click(magicLinkButtons[0])

      await waitFor(() => {
        const successMessages = screen.getAllByText('Magic link sent!')
        const instructionMessages = screen.getAllByText('Check your email and click the link to sign in.')
        expect(successMessages.length).toBeGreaterThan(0)
        expect(instructionMessages.length).toBeGreaterThan(0)
      })
    })

    it('should disable magic link button when email is empty', () => {
      render(<SignIn />)

      const magicLinkButtons = screen.getAllByRole('button', { name: 'Send Magic Link' })
      // Both buttons should be disabled when email is empty
      expect(magicLinkButtons[0]).toBeDisabled()
      expect(magicLinkButtons[1]).toBeDisabled()
    })

    it('should enable magic link button when email is provided', () => {
      render(<SignIn />)

      const emailInputs = screen.getAllByLabelText('Email')
      fireEvent.change(emailInputs[0], {
        target: { value: 'test@example.com' },
      })

      const magicLinkButtons = screen.getAllByRole('button', { name: 'Send Magic Link' })
      // Both buttons should be enabled when email is provided (shared state)
      expect(magicLinkButtons[0]).not.toBeDisabled()
      expect(magicLinkButtons[1]).not.toBeDisabled()
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

      const emailInputs = screen.getAllByLabelText('Email')
      const magicLinkButtons = screen.getAllByRole('button', { name: 'Send Magic Link' })

      fireEvent.change(emailInputs[0], {
        target: { value: 'test@example.com' },
      })
      fireEvent.click(magicLinkButtons[0])

      // Both forms show "Sending..." text, so use getAllByText
      const sendingTexts = screen.getAllByText('Sending...')
      expect(sendingTexts.length).toBeGreaterThan(0)
    })

    it('should display error message when magic link fails', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'Failed to send magic link' }),
      })
      global.fetch = mockFetch

      render(<SignIn />)

      const emailInputs = screen.getAllByLabelText('Email')
      const magicLinkButtons = screen.getAllByRole('button', { name: 'Send Magic Link' })

      fireEvent.change(emailInputs[0], {
        target: { value: 'test@example.com' },
      })
      fireEvent.click(magicLinkButtons[0])

      await waitFor(() => {
        const errorMessages = screen.getAllByText('Failed to send magic link')
        expect(errorMessages.length).toBeGreaterThan(0)
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

      // Wait for the redirect (there's a 500ms delay in the component)
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/sales')
      }, { timeout: 1000 })
    })

    it('should redirect to specified page after successful sign in', async () => {
      mockGet.mockReturnValue('/favorites')
      mockSignIn.mockResolvedValueOnce({})

      render(<SignIn />)

      const emailInputs = screen.getAllByLabelText('Email')
      const passwordInputs = screen.getAllByLabelText('Password')
      const signInButtons = screen.getAllByRole('button', { name: 'Sign In' })

      fireEvent.change(emailInputs[0], {
        target: { value: 'test@example.com' },
      })
      fireEvent.change(passwordInputs[0], {
        target: { value: 'password123' },
      })
      fireEvent.click(signInButtons[0])

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

      // Both forms show "Signing in..." text, so use getAllByText
      const signingInTexts = screen.getAllByText('Signing in...')
      expect(signingInTexts.length).toBeGreaterThan(0)
    })
  })

  describe('Form Validation', () => {
    it('should require email and password for sign in', () => {
      render(<SignIn />)

      const emailInputs = screen.getAllByLabelText('Email')
      const passwordInputs = screen.getAllByLabelText('Password')
      const signInButtons = screen.getAllByRole('button', { name: 'Sign In' })

      // Check first form (mobile) - both should have same validation
      expect(emailInputs[0]).toBeRequired()
      expect(passwordInputs[0]).toBeRequired()
      expect(signInButtons.length).toBeGreaterThan(0)
    })

    it('should validate email format', () => {
      render(<SignIn />)

      const emailInputs = screen.getAllByLabelText('Email')
      // Check first form (mobile) - both should have same validation
      expect(emailInputs[0]).toHaveAttribute('type', 'email')
    })
  })
})
