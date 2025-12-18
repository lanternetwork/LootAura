/**
 * @vitest-environment jsdom
 *
 * Sell Wizard Promote CTA tests
 * - Gating by PROMOTIONS_ENABLED
 * - Local-only toggle (no network side effects)
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SellWizardClient from '@/app/sell/new/SellWizardClient'

// Reuse global supabase browser client mock from tests/setup.ts

// Mock wizard-only heavy child components to keep tests focused and fast
vi.mock('@/components/location/AddressAutocomplete', () => ({
  default: () => <div data-testid="address-autocomplete">Address Autocomplete</div>,
}))

vi.mock('@/components/TimePicker30', () => ({
  default: () => <div data-testid="time-picker">Time Picker</div>,
}))

vi.mock('@/components/sales/ItemFormModal', () => ({
  default: () => null,
}))

vi.mock('@/components/sales/ImageUploadCard', () => ({
  default: () => <div data-testid="image-upload">Image Upload</div>,
}))

vi.mock('@/components/upload/ImageThumbnailGrid', () => ({
  default: () => <div data-testid="image-thumbnails">Image Thumbnails</div>,
}))

vi.mock('@/components/sales/ItemCard', () => ({
  default: () => <div data-testid="item-card">Item Card</div>,
}))

// Helper to render with QueryClient
const renderWithQueryClient = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  )
}

describe('Sell Wizard Promote CTA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const baseInitialData = {
    title: 'Test Sale',
    address: '123 Test St',
    city: 'Test City',
    state: 'TS',
    // Details step requires lat/lng to be present; in production these come from AddressAutocomplete onPlaceSelected.
    // This test mocks AddressAutocomplete, so seed coordinates directly to avoid hanging on Next.
    lat: 38.25,
    lng: -85.75,
    date_start: '2025-01-01',
    time_start: '09:00',
  }

  const goToReviewStep = async (promotionsEnabled: boolean = false) => {
    // Move from Details → Photos → Items → (Promote if enabled) → Review
    const nextButton = screen.getByRole('button', { name: /next/i })
    // Details (validated)
    fireEvent.click(nextButton)
    // Photos
    await waitFor(() => {
      expect(screen.getByTestId('image-upload')).toBeInTheDocument()
    })
    // handleNext uses a short navigation guard; wait for it to reset before clicking Next again
    await new Promise(resolve => setTimeout(resolve, 600))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    // Items
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument()
    })
    // handleNext uses a short navigation guard; wait for it to reset before clicking Next again
    await new Promise(resolve => setTimeout(resolve, 600))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    
    // If promotions enabled, we should see Promote step
    if (promotionsEnabled) {
      await waitFor(() => {
        expect(screen.getByTestId('promote-step-heading')).toBeInTheDocument()
      })
      // Navigate past Promote step
      await new Promise(resolve => setTimeout(resolve, 600))
      fireEvent.click(screen.getByRole('button', { name: /next/i }))
    }
    
    // Review
    await waitFor(() => {
      const publishButtons = screen.queryAllByRole('button', { name: /publish sale/i })
      const checkoutButtons = screen.queryAllByRole('button', { name: /checkout.*publish/i })
      expect(publishButtons.length > 0 || checkoutButtons.length > 0).toBe(true)
    })
  }

  it('hides Promote step and Review checkbox when promotions are disabled', async () => {
    renderWithQueryClient(
      <SellWizardClient
        initialData={baseInitialData}
        userLat={38.25}
        userLng={-85.75}
        promotionsEnabled={false}
        paymentsEnabled={true}
      />
    )

    await goToReviewStep(false)

    // Should not see Promote step heading
    expect(screen.queryByTestId('promote-step-heading')).not.toBeInTheDocument()
    // Should not see Review checkbox
    expect(screen.queryByTestId('review-promote-checkbox')).toBeNull()
    // Should see normal Publish button (use getAllByRole and check first one)
    const publishButtons = screen.getAllByRole('button', { name: /publish sale/i })
    expect(publishButtons.length).toBeGreaterThan(0)
  })

  it('shows Promote step when promotions are enabled', async () => {
    renderWithQueryClient(
      <SellWizardClient
        initialData={baseInitialData}
        userLat={38.25}
        userLng={-85.75}
        promotionsEnabled={true}
        paymentsEnabled={true}
      />
    )

    // Navigate to Items step
    const nextButton = screen.getByRole('button', { name: /next/i })
    fireEvent.click(nextButton)
    await waitFor(() => {
      expect(screen.getByTestId('image-upload')).toBeInTheDocument()
    })
    await new Promise(resolve => setTimeout(resolve, 600))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument()
    })
    await new Promise(resolve => setTimeout(resolve, 600))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    
    // Should see Promote step
    await waitFor(() => {
      expect(screen.getByTestId('promote-step-heading')).toBeInTheDocument()
    })
  })

  it('shows subtle checkbox on Review step when promotions are enabled', async () => {
    renderWithQueryClient(
      <SellWizardClient
        initialData={baseInitialData}
        userLat={38.25}
        userLng={-85.75}
        promotionsEnabled={true}
        paymentsEnabled={true}
      />
    )

    await goToReviewStep(true)

    // Should see Review checkbox
    expect(screen.getByTestId('review-promote-checkbox')).toBeInTheDocument()
    expect(screen.getByText(/promote this sale/i)).toBeInTheDocument()
  })

  it('syncs state between Promote step toggle and Review checkbox', async () => {
    renderWithQueryClient(
      <SellWizardClient
        initialData={baseInitialData}
        userLat={38.25}
        userLng={-85.75}
        promotionsEnabled={true}
        paymentsEnabled={true}
      />
    )

    // Navigate to Promote step
    const nextButton = screen.getByRole('button', { name: /next/i })
    fireEvent.click(nextButton)
    await waitFor(() => {
      expect(screen.getByTestId('image-upload')).toBeInTheDocument()
    })
    await new Promise(resolve => setTimeout(resolve, 600))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument()
    })
    await new Promise(resolve => setTimeout(resolve, 600))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    
    await waitFor(() => {
      expect(screen.getByTestId('promote-step-heading')).toBeInTheDocument()
    })

    // Find and toggle the promotion switch on Promote step
    const promoteToggle = screen.getByTestId('promote-step-toggle')
    expect(promoteToggle).not.toBeChecked()
    fireEvent.click(promoteToggle)
    expect(promoteToggle).toBeChecked()

    // Navigate to Review step
    await new Promise(resolve => setTimeout(resolve, 600))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    
    await waitFor(() => {
      expect(screen.getByTestId('review-promote-checkbox')).toBeInTheDocument()
    })

    // Review checkbox should be checked (state synced)
    const reviewCheckbox = screen.getByTestId('review-promote-checkbox')
    expect(reviewCheckbox).toBeChecked()

    // Uncheck on Review step
    fireEvent.click(reviewCheckbox)
    expect(reviewCheckbox).not.toBeChecked()
  })

  it('changes CTA label to "Checkout & publish" when promotion is selected', async () => {
    renderWithQueryClient(
      <SellWizardClient
        initialData={baseInitialData}
        userLat={38.25}
        userLng={-85.75}
        promotionsEnabled={true}
        paymentsEnabled={true}
      />
    )

    await goToReviewStep(true)

    // Initially should show "Publish Sale"
    const initialPublishButtons = screen.getAllByRole('button', { name: /publish sale/i })
    expect(initialPublishButtons.length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('button', { name: /checkout.*publish/i })).toHaveLength(0)

    // Check the promotion checkbox
    const checkbox = screen.getByTestId('review-promote-checkbox')
    fireEvent.click(checkbox)

    // Should now show "Checkout & publish"
    await waitFor(() => {
      const checkoutButtons = screen.getAllByRole('button', { name: /checkout.*publish/i })
      expect(checkoutButtons.length).toBeGreaterThan(0)
    })
    expect(screen.queryAllByRole('button', { name: /publish sale/i })).toHaveLength(0)
  })

  it('shows error message and keeps checkbox checked when payments disabled and checkout clicked (draft-first flow)', async () => {
    // Mock fetch to simulate successful sale creation but prevent checkout calls
    const mockFetch = vi.fn()
    global.fetch = mockFetch
    
    // Mock may be called for draft operations during navigation, so handle multiple calls
    // Return successful sale creation for either /api/drafts/publish or /api/sales
    mockFetch.mockImplementation((url: string | Request | URL, options?: RequestInit) => {
      const urlString = typeof url === 'string' ? url : url instanceof Request ? url.url : url.toString()
      const method = options?.method || (url instanceof Request ? url.method : 'GET')
      
      if (urlString.includes('/api/drafts/publish') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            data: { saleId: 'test-sale-id' }
          })
        })
      }
      if (urlString.includes('/api/sales') && method === 'POST') {
        // With draft-first flow, sale is created as draft when promotion is enabled
        return Promise.resolve({
          ok: true,
          json: async () => ({
            saleId: 'test-sale-id' // Returns saleId (draft sale created)
          })
        })
      }
      if (urlString.includes('/api/items_v2') && method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true })
        })
      }
      if (urlString.includes('/api/drafts') && method === 'POST') {
        // Draft save operations
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true })
        })
      }
      // For any other calls (e.g., CSRF, analytics, etc.), return a successful empty response
      // This prevents the test from failing on unexpected but harmless API calls
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true })
      })
    })

    renderWithQueryClient(
      <SellWizardClient
        initialData={baseInitialData}
        userLat={38.25}
        userLng={-85.75}
        promotionsEnabled={true}
        paymentsEnabled={false}
      />
    )

    await goToReviewStep(true)

    // Check promotion checkbox
    const checkbox = screen.getByTestId('review-promote-checkbox')
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()

    // Click "Checkout & publish" button
    const publishButton = await screen.findByRole('button', { name: /checkout.*publish/i })
    fireEvent.click(publishButton)

    // Should show error message inline (wait for sale creation as draft and error to appear)
    // With new draft-first flow, sale is created as draft, error is shown next to toggle
    await waitFor(() => {
      // Check for error message in the UI (shown next to promotion toggle)
      const allText = document.body.textContent || ''
      const hasMessage = allText.toLowerCase().includes('promotions aren\'t available yet') ||
                         allText.toLowerCase().includes('promotions are not available')
      
      if (!hasMessage) {
        throw new Error('Error message not found in document')
      }
    }, { timeout: 10000 })

    // Should not call checkout API (sale is created as draft, no checkout attempted)
    const checkoutCalls = mockFetch.mock.calls.filter(call => 
      typeof call[0] === 'string' && call[0].includes('/api/promotions/checkout')
    )
    expect(checkoutCalls).toHaveLength(0)

    // Checkbox should remain checked (user can see their selection and uncheck manually if needed)
    // With new draft-first flow, we keep the state so user can retry or uncheck and publish
    expect(checkbox).toBeChecked()
  })
})

