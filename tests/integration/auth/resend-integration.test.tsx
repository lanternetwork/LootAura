import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import ResendConfirmation from '@/components/auth/ResendConfirmation'

describe('Resend Confirmation Integration', () => {
  beforeEach(() => {
    // Clear mocks before each test
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    // Clean up mocks and reset state
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('should show resend link and handle successful resend', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Confirmation email sent' }),
    } as Response)

    render(<ResendConfirmation email="test@example.com" />)

    // Check that the resend link is visible
    expect(screen.getByText("Didn't receive the confirmation email?")).toBeInTheDocument()
    
    const resendButton = screen.getByRole('button', { name: 'Resend confirmation email' })
    expect(resendButton).toBeInTheDocument()

    // Click the resend button
    fireEvent.click(resendButton)

    // Check that loading state is shown
    expect(screen.getByText('Sending...')).toBeInTheDocument()

    // Wait for the success message
    await waitFor(() => {
      expect(screen.getByText('Confirmation email sent! Please check your inbox.')).toBeInTheDocument()
    })

    // Verify the API was called correctly
    expect(fetch).toHaveBeenCalledWith('/api/auth/resend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'test@example.com' }),
    })
  })

  it('should handle resend failure', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Rate limit exceeded' }),
    } as Response)

    render(<ResendConfirmation email="test@example.com" />)

    const resendButton = screen.getByRole('button', { name: 'Resend confirmation email' })
    fireEvent.click(resendButton)

    await waitFor(() => {
      expect(screen.getByText('Failed to send confirmation email. Please try again.')).toBeInTheDocument()
    })
  })

  it('should handle network error', async () => {
    (fetch as any).mockRejectedValueOnce(new Error('Network error'))

    render(<ResendConfirmation email="test@example.com" />)

    const resendButton = screen.getByRole('button', { name: 'Resend confirmation email' })
    fireEvent.click(resendButton)

    await waitFor(() => {
      expect(screen.getByText('Failed to send confirmation email. Please try again.')).toBeInTheDocument()
    })
  })
})
