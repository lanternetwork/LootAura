/**
 * @vitest-environment jsdom
 *
 * Regression: categories (tags) must be selectable in SellWizardClient on /sell/new.
 * A previous effect unintentionally reset tags to [] on every render when initialData was undefined.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SellWizardClient from '@/app/sell/new/SellWizardClient'

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

const renderWithQueryClient = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>)
}

describe('Sell Wizard Categories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows selecting a category (tag) and keeps it selected after effects run', async () => {
    renderWithQueryClient(
      <SellWizardClient promotionsEnabled={false} paymentsEnabled={false} />
    )

    const furnitureCheckbox = screen.getByLabelText('Furniture') as HTMLInputElement
    expect(furnitureCheckbox.checked).toBe(false)

    fireEvent.click(furnitureCheckbox)

    // Let React effects flush; previously, an effect would immediately reset tags back to [].
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect((screen.getByLabelText('Furniture') as HTMLInputElement).checked).toBe(true)
  })
})


