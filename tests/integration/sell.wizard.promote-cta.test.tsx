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
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    // Items
    await waitFor(() => {
      expect(screen.getByTestId('image-thumbnails')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
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

