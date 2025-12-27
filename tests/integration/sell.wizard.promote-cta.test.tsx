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
    // Clear mocks but preserve the Supabase mock's resolved values
    // The Supabase mock from tests/setup.ts must remain functional
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

  const goToReviewStep = async () => {
    // Move from Details → Photos → Items → Review
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
    // Review - wait for the step to change by checking for Review step content
    // The Review step renders "Review Your Sale" heading, which is more reliable than waiting for the button
    await waitFor(() => {
      expect(screen.getByText('Review Your Sale')).toBeInTheDocument()
    })
    // Now verify the Publish Sale button exists
    const buttons = screen.queryAllByRole('button', { name: /publish sale/i })
    expect(buttons.length).toBeGreaterThan(0)
  }

  it('hides Feature your sale toggle when promotions are disabled', async () => {
    renderWithQueryClient(
      <SellWizardClient
        initialData={baseInitialData}
        userLat={38.25}
        userLng={-85.75}
        promotionsEnabled={false}
        paymentsEnabled={true}
      />
    )

    await goToReviewStep()

    expect(screen.queryByTestId('review-feature-toggle')).toBeNull()
  })

  it('shows Feature your sale toggle when promotions are enabled', async () => {
    renderWithQueryClient(
      <SellWizardClient
        initialData={baseInitialData}
        userLat={38.25}
        userLng={-85.75}
        promotionsEnabled={true}
        paymentsEnabled={true}
      />
    )

    await goToReviewStep()

    expect(screen.getByTestId('review-feature-toggle')).toBeInTheDocument()
  })
})

