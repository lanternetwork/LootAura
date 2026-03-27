import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock next/navigation for SellWizardClient
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => ({
    get: vi.fn(),
  }),
}))

// Mock Supabase browser client used inside SellWizardClient
const mockGetUser = vi.fn()
const mockOnAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: mockGetUser,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
}))

describe('Sell Wizard auth messaging and date fields', () => {
  let SellWizardClient: any

  beforeEach(async () => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const module = await import('@/app/sell/new/SellWizardClient')
    SellWizardClient = module.default
  })

  afterEach(() => {
    cleanup()
  })

  it('shows anonymous sign-in messaging when not authenticated', () => {
    render(<SellWizardClient promotionsEnabled={false} />)

    expect(
      screen.getByText("You can fill this out without an account. We'll ask you to sign in when you submit.")
    ).toBeInTheDocument()
  })

  it('hides anonymous sign-in messaging when authenticated', async () => {
    // React StrictMode can invoke effects twice in test runs, so return the
    // authenticated user consistently (not just once).
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
    })

    render(<SellWizardClient promotionsEnabled={false} />)

    // Allow initial auth check effect to run
    await screen.findByText('List Your Sale')

    expect(
      screen.queryByText("You can fill this out without an account. We'll ask you to sign in when you submit.")
    ).not.toBeInTheDocument()
  })

  it('clicking the Start Date field does not trigger navigation', () => {
    render(<SellWizardClient promotionsEnabled={false} />)

    const startDateInput = screen.getByLabelText('Start Date *') as HTMLInputElement

    fireEvent.click(startDateInput)

    expect(mockPush).not.toHaveBeenCalled()
  })
})

