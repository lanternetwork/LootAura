/**
 * @vitest-environment jsdom
 *
 * Sell Wizard Promote CTA tests
 * - Gating by PROMOTIONS_ENABLED
 * - Local-only toggle (no network side effects)
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SellWizardClient from '@/app/sell/new/SellWizardClient'

// Reuse global supabase browser client mock from tests/setup.ts

// Mock wizard-only heavy child components to keep tests focused and fast
// AddressAutocomplete mock must call onPlaceSelected to set lat/lng required for validation
// @ts-ignore vitest mock hoisting in test env
vi.mock('@/components/location/AddressAutocomplete', () => {
  const MockAddressAutocomplete = ({ onPlaceSelected, value, onChange }: any) => {
    // Call onPlaceSelected on mount to set lat/lng coordinates required for validation
    React.useEffect(() => {
      if (onPlaceSelected) {
        onPlaceSelected({
          address: value || '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip: '40201',
          lat: 38.25,
          lng: -85.75,
        })
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return React.createElement('div', { 'data-testid': 'address-autocomplete' }, 'Address Autocomplete')
  }
  return {
    default: MockAddressAutocomplete,
  }
})

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
    // DO NOT call vi.clearAllMocks() - it may interfere with the module-level Supabase mock
    // The Supabase mock from tests/setup.ts is a constant object literal and should be immune,
    // but to be safe, we avoid clearing mocks that might affect module-level mocks
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

  const goToItemsStep = async () => {
    const user = userEvent.setup()
    // Move from Details → Photos → Items
    // Wait for form to be ready (AddressAutocomplete mock sets lat/lng via useEffect)
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Sale')).toBeInTheDocument()
    })
    // Details (validated) - all required fields are populated via initialData and AddressAutocomplete mock
    await user.click(screen.getByRole('button', { name: /next/i }))
    // Photos - await progression with findByTestId
    await screen.findByTestId('image-upload')
    // handleNext uses a short navigation guard; wait for it to reset before clicking Next again
    await new Promise(resolve => setTimeout(resolve, 600))
    await user.click(screen.getByRole('button', { name: /next/i }))
    // Items
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument()
    })
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

    const user = userEvent.setup()
    await goToItemsStep()
    
    // When promotions are disabled, clicking Next from Items should skip to Review
    // handleNext uses a short navigation guard; wait for it to reset before clicking Next again
    await new Promise(resolve => setTimeout(resolve, 600))
    await user.click(screen.getByRole('button', { name: /next/i }))
    
    // Should go directly to Review (promotion step skipped)
    await waitFor(() => {
      expect(screen.getByText('Review Your Sale')).toBeInTheDocument()
    })

    // Toggle should not exist anywhere
    expect(screen.queryByTestId('promotion-step-feature-toggle')).toBeNull()
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

    const user = userEvent.setup()
    await goToItemsStep()
    
    // When promotions are enabled, clicking Next from Items should go to Promotion step
    // handleNext uses a short navigation guard; wait for it to reset before clicking Next again
    await new Promise(resolve => setTimeout(resolve, 600))
    await user.click(screen.getByRole('button', { name: /next/i }))
    
    // Should go to Promotion step
    await waitFor(() => {
      expect(screen.getByText('Promote Your Sale')).toBeInTheDocument()
    })

    // Toggle should exist in the promotion step
    expect(screen.getByTestId('promotion-step-feature-toggle')).toBeInTheDocument()
  })
})

