/**
 * @vitest-environment jsdom
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DashboardClient from '@/app/(dashboard)/dashboard/DashboardClient'
import type { ProfileData } from '@/lib/data/profileAccess'

// Mock fetch - will be properly set up in beforeEach
const mockFetch = vi.fn()

// Mock Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: { id: 'test-user-id' } },
        error: null,
      })),
    },
  })),
}))

// Mock toast
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Dashboard Profile Editing', () => {
  const mockSales = [
    { id: 'sale-1', title: 'Test Sale 1', owner_id: 'test-user-id', status: 'published' },
  ] as any

  const mockProfile: ProfileData = {
    id: 'test-user-id',
    username: 'testuser',
    display_name: 'Test User',
    avatar_url: null,
    bio: 'Initial bio',
    location_city: 'Louisville',
    location_region: 'KY',
    created_at: new Date().toISOString(),
    verified: false,
    social_links: null,
  }

  const mockMetrics = {
    views7d: 0,
    saves7d: 0,
    ctr7d: 0,
    salesFulfilled: 0,
    series: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Set up fetch mock
    global.fetch = mockFetch as any
    mockFetch.mockClear()
  })

  const renderWithQueryClient = (component: React.ReactElement) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    )
  }

  it('should render ProfileInfoCard with initial profile data', () => {
    renderWithQueryClient(
      <DashboardClient
        initialSales={mockSales}
        initialProfile={mockProfile}
        initialMetrics={mockMetrics}
      />
    )
    
    expect(screen.getByText('Profile Information')).toBeInTheDocument()
    // When not editing, values are displayed as text, not inputs
    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByText('Initial bio')).toBeInTheDocument()
    expect(screen.getByText('Louisville')).toBeInTheDocument()
    expect(screen.getByText('KY')).toBeInTheDocument()
  })

  it('should allow editing profile info and save changes', async () => {
    const user = userEvent.setup()
    
    // Mock successful API response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          profile: {
            ...mockProfile,
            display_name: 'Updated Name',
            bio: 'Updated bio',
          },
        },
      }),
    } as Response)

    renderWithQueryClient(
      <DashboardClient
        initialSales={mockSales}
        initialProfile={mockProfile}
        initialMetrics={mockMetrics}
      />
    )

    // Click Edit button in ProfileInfoCard (use getAllByText and filter by role/context)
    const editButtons = screen.getAllByText('Edit')
    // Find the button in ProfileInfoCard (should be a button, not a link)
    const editButton = editButtons.find(btn => btn.tagName === 'BUTTON' && btn.textContent === 'Edit')
    expect(editButton).toBeInTheDocument()
    await user.click(editButton!)

    // Change display name
    const displayNameInput = screen.getByDisplayValue('Test User')
    await user.clear(displayNameInput)
    await user.type(displayNameInput, 'Updated Name')

    // Change bio
    const bioInput = screen.getByDisplayValue('Initial bio')
    await user.clear(bioInput)
    await user.type(bioInput, 'Updated bio')

    // Click Save button
    const saveButton = screen.getByText('Save')
    expect(saveButton).not.toBeDisabled()
    await user.click(saveButton)

    // Wait for API call
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/profile/update',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: 'Updated Name',
            bio: 'Updated bio',
            city: 'Louisville',
            region: 'KY',
          }),
        })
      )
    })
  })

  it('should disable Save button when no changes are made', async () => {
    const user = userEvent.setup()

    renderWithQueryClient(
      <DashboardClient
        initialSales={mockSales}
        initialProfile={mockProfile}
        initialMetrics={mockMetrics}
      />
    )

    // Click Edit button in ProfileInfoCard
    const editButtons = screen.getAllByText('Edit')
    const editButton = editButtons.find(btn => btn.tagName === 'BUTTON' && btn.textContent === 'Edit')
    expect(editButton).toBeInTheDocument()
    await user.click(editButton!)

    // Save button should be disabled initially (no changes)
    const saveButton = screen.getByText('Save')
    expect(saveButton).toBeDisabled()
  })

  it('should allow canceling edits and restore original values', async () => {
    const user = userEvent.setup()

    renderWithQueryClient(
      <DashboardClient
        initialSales={mockSales}
        initialProfile={mockProfile}
        initialMetrics={mockMetrics}
      />
    )

    // Click Edit button in ProfileInfoCard
    const editButtons = screen.getAllByText('Edit')
    const editButton = editButtons.find(btn => btn.tagName === 'BUTTON' && btn.textContent === 'Edit')
    expect(editButton).toBeInTheDocument()
    await user.click(editButton!)

    // Wait for edit mode to activate
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test User')).toBeInTheDocument()
    })

    // Change display name
    const displayNameInput = screen.getByDisplayValue('Test User')
    await user.clear(displayNameInput)
    await user.type(displayNameInput, 'Changed Name')

    // Click Cancel button
    const cancelButton = screen.getByText('Cancel')
    await user.click(cancelButton)

    // Should be back to view mode with original value
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument()
    })
  })
})

