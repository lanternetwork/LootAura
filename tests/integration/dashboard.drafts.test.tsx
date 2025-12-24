/**
 * Integration tests for dashboard drafts functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DraftsPanel from '@/components/dashboard/DraftsPanel'
import DraftCard from '@/components/dashboard/DraftCard'
import type { DraftListing } from '@/lib/data/salesAccess'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

// Mock react-toastify
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock draft client
vi.mock('@/lib/draft/draftClient', () => ({
  publishDraftServer: vi.fn(),
  deleteDraftServer: vi.fn(),
}))

describe('DraftsPanel', () => {
  const mockDrafts: DraftListing[] = [
    {
      id: 'draft-1',
      draft_key: 'key-1',
      title: 'Test Draft 1',
      updated_at: new Date().toISOString(),
      payload: {
        formData: { title: 'Test Draft 1' },
        photos: ['https://example.com/photo.jpg'],
        items: [{ id: 'item-1', name: 'Item 1', category: 'tools' }],
      },
    },
    {
      id: 'draft-2',
      draft_key: 'key-2',
      title: 'Test Draft 2',
      updated_at: new Date().toISOString(),
      payload: {
        formData: { title: 'Test Draft 2' },
        photos: [],
        items: [],
      },
    },
  ]

  const mockHandlers = {
    onDelete: vi.fn(),
    onPublish: vi.fn(),
    onRetry: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render parent card with correct count badge', () => {
    render(
      <DraftsPanel
        drafts={mockDrafts}
        onDelete={mockHandlers.onDelete}
        onPublish={mockHandlers.onPublish}
      />
    )

    // Heading should be present
    expect(screen.getByRole('heading', { name: 'Drafts' })).toBeInTheDocument()
    // Badge count should be rendered somewhere in the panel
    const countBadges = screen.getAllByText('2')
    expect(countBadges.length).toBeGreaterThan(0)
  })

  it('should show empty state when no drafts', () => {
    render(
      <DraftsPanel
        drafts={[]}
        onDelete={mockHandlers.onDelete}
        onPublish={mockHandlers.onPublish}
      />
    )

    expect(screen.getByText('No drafts yet.')).toBeInTheDocument()
  })

  it('should show loading skeletons when loading', () => {
    render(
      <DraftsPanel
        drafts={[]}
        isLoading={true}
        onDelete={mockHandlers.onDelete}
        onPublish={mockHandlers.onPublish}
      />
    )

    // Check for skeleton elements (they have animate-pulse class)
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('should show error state with retry button', () => {
    render(
      <DraftsPanel
        drafts={[]}
        error={{ message: 'Failed to load' }}
        onDelete={mockHandlers.onDelete}
        onPublish={mockHandlers.onPublish}
        onRetry={mockHandlers.onRetry}
      />
    )

    expect(screen.getByText('Failed to load drafts')).toBeInTheDocument()
    // Look specifically for the Retry button rather than any text node
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('should call onRetry when retry button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <DraftsPanel
        drafts={[]}
        error={{ message: 'Failed to load' }}
        onDelete={mockHandlers.onDelete}
        onPublish={mockHandlers.onPublish}
        onRetry={mockHandlers.onRetry}
      />
    )

    const retryButton = screen.getByRole('button', { name: 'Retry' })
    await user.click(retryButton)

    expect(mockHandlers.onRetry).toHaveBeenCalledTimes(1)
  })

  it('should render draft cards in grid', () => {
    render(
      <DraftsPanel
        drafts={mockDrafts}
        onDelete={mockHandlers.onDelete}
        onPublish={mockHandlers.onPublish}
      />
    )

    expect(screen.getAllByText('Test Draft 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Test Draft 2').length).toBeGreaterThan(0)
  })
})

describe('DraftCard', () => {
  const mockDraft: DraftListing = {
    id: 'draft-1',
    draft_key: 'key-1',
    title: 'Test Draft',
    updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    payload: {
      formData: {
        title: 'Test Draft',
        date_start: '2025-01-15',
        date_end: '2025-01-16',
      },
      photos: ['https://example.com/photo.jpg'],
      items: [
        { id: 'item-1', name: 'Item 1', category: 'tools' },
        { id: 'item-2', name: 'Item 2', category: 'electronics' },
        { id: 'item-3', name: 'Item 3', category: 'furniture' },
      ],
    },
  }

  const mockHandlers = {
    onDelete: vi.fn(),
    onPublish: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render draft title', () => {
    render(<DraftCard draft={mockDraft} onDelete={mockHandlers.onDelete} onPublish={mockHandlers.onPublish} />)

    expect(screen.getByText('Test Draft')).toBeInTheDocument()
  })

  it('should show "Untitled Draft" when title is missing', () => {
    const draftWithoutTitle = { ...mockDraft, title: null, payload: { formData: {} } }
    render(<DraftCard draft={draftWithoutTitle} onDelete={mockHandlers.onDelete} onPublish={mockHandlers.onPublish} />)

    expect(screen.getByText('Untitled Draft')).toBeInTheDocument()
  })

  it('should display item count and categories', () => {
    render(<DraftCard draft={mockDraft} onDelete={mockHandlers.onDelete} onPublish={mockHandlers.onPublish} />)

    expect(screen.getAllByText('3 items').length).toBeGreaterThan(0)
    expect(screen.getByText('Tools')).toBeInTheDocument()
    expect(screen.getByText('Electronics')).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('should show date range when available', () => {
    render(<DraftCard draft={mockDraft} onDelete={mockHandlers.onDelete} onPublish={mockHandlers.onPublish} />)

    // Date range should be displayed
    const dateText = screen.getByText(/1\/15\/2025/)
    expect(dateText).toBeInTheDocument()
  })

  it('should show Continue button', () => {
    render(<DraftCard draft={mockDraft} onDelete={mockHandlers.onDelete} onPublish={mockHandlers.onPublish} />)

    expect(screen.getByText('Continue')).toBeInTheDocument()
  })

  it('should show Publish and Delete buttons', () => {
    render(<DraftCard draft={mockDraft} onDelete={mockHandlers.onDelete} onPublish={mockHandlers.onPublish} />)

    expect(screen.getByText('Publish')).toBeInTheDocument()
    expect(screen.getByLabelText(/Delete/)).toBeInTheDocument()
  })
})

