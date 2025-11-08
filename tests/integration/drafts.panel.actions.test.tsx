/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import DraftCard from '@/components/dashboard/DraftCard'
import { publishDraftServer, deleteDraftServer } from '@/lib/draft/draftClient'
import type { DraftListing } from '@/lib/data/salesAccess'

// Mock Next.js router
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock draft client
vi.mock('@/lib/draft/draftClient', () => ({
  publishDraftServer: vi.fn(),
  deleteDraftServer: vi.fn(),
}))

// Mock react-toastify
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock sessionStorage
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
})

const mockDraft: DraftListing = {
  id: 'draft-1',
  draft_key: 'draft-key-1',
  title: 'Test Draft',
  updated_at: new Date().toISOString(),
  payload: {
    formData: { title: 'Test Draft' },
    photos: ['photo1.jpg'],
    items: [{ name: 'Item 1', category: 'furniture' }],
  },
}

describe('DraftCard Actions', () => {
  const mockOnDelete = vi.fn()
  const mockOnPublish = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSessionStorage.setItem.mockClear()
  })

  it('should set session keys and route on Continue', () => {
    render(<DraftCard draft={mockDraft} onDelete={mockOnDelete} onPublish={mockOnPublish} />)
    
    const continueButton = screen.getByLabelText(/Continue editing/i)
    fireEvent.click(continueButton)
    
    expect(mockSessionStorage.setItem).toHaveBeenCalledWith('auth:postLoginRedirect', '/sell/new?resume=review')
    expect(mockSessionStorage.setItem).toHaveBeenCalledWith('draft:returnStep', 'review')
    expect(mockSessionStorage.setItem).toHaveBeenCalledWith('draft:key', 'draft-key-1')
    expect(mockPush).toHaveBeenCalledWith('/sell/new?resume=review')
  })

  it('should call publishDraftServer and remove draft on Publish', async () => {
    vi.mocked(publishDraftServer).mockResolvedValueOnce({
      ok: true,
      data: { saleId: 'sale-1' },
    })

    render(<DraftCard draft={mockDraft} onDelete={mockOnDelete} onPublish={mockOnPublish} />)
    
    const publishButton = screen.getByLabelText(/Publish/i)
    fireEvent.click(publishButton)
    
    await waitFor(() => {
      expect(publishDraftServer).toHaveBeenCalledWith('draft-key-1')
      expect(mockOnPublish).toHaveBeenCalledWith('draft-key-1', 'sale-1')
    })
  })

  it('should call deleteDraftServer and remove draft on Delete', async () => {
    vi.mocked(deleteDraftServer).mockResolvedValueOnce({
      ok: true,
    })

    render(<DraftCard draft={mockDraft} onDelete={mockOnDelete} onPublish={mockOnPublish} />)
    
    const deleteButton = screen.getByLabelText(/Delete/i)
    fireEvent.click(deleteButton)
    
    // Confirm delete
    const confirmButton = screen.getByText('Delete')
    fireEvent.click(confirmButton)
    
    await waitFor(() => {
      expect(deleteDraftServer).toHaveBeenCalledWith('draft-key-1')
      expect(mockOnDelete).toHaveBeenCalledWith('draft-key-1')
    })
  })
})

