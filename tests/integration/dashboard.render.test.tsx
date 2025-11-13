/**
 * @vitest-environment jsdom
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// Note: DashboardPage is a server component, so we test it indirectly through DashboardClient
import DashboardClient from '@/app/(dashboard)/dashboard/DashboardClient'
import { createSupabaseServerClient } from '@/lib/supabase/server'

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

// Mock data access helpers
vi.mock('@/lib/data/salesAccess', () => ({
  getUserSales: vi.fn(() => Promise.resolve({
    data: [
      { id: 'sale-1', title: 'Test Sale 1', owner_id: 'test-user-id', status: 'published' },
      { id: 'sale-2', title: 'Test Sale 2', owner_id: 'test-user-id', status: 'published' },
    ],
    source: 'view' as const,
  })),
  getUserDrafts: vi.fn(() => Promise.resolve({
    data: [
      {
        id: 'draft-1',
        draft_key: 'draft-key-1',
        title: 'Test Draft 1',
        updated_at: new Date().toISOString(),
        payload: { formData: { title: 'Test Draft 1' } },
      },
    ],
  })),
}))

vi.mock('@/lib/data/profileAccess', () => ({
  getUserProfile: vi.fn(() => Promise.resolve({
    id: 'test-user-id',
    username: 'testuser',
    display_name: 'Test User',
    avatar_url: null,
    bio: null,
    location_city: null,
    location_region: null,
    created_at: new Date().toISOString(),
    verified: false,
  })),
  getUserMetrics7d: vi.fn(() => Promise.resolve({
    views7d: 0,
    saves7d: 0,
    ctr7d: 0,
    salesFulfilled: 0,
    series: [],
  })),
}))

describe('Dashboard Client', () => {
  const mockSales = [
    { id: 'sale-1', title: 'Test Sale 1', owner_id: 'test-user-id', status: 'published' },
    { id: 'sale-2', title: 'Test Sale 2', owner_id: 'test-user-id', status: 'published' },
  ] as any

  const mockDrafts = [
    {
      id: 'draft-1',
      draft_key: 'draft-key-1',
      title: 'Test Draft 1',
      updated_at: new Date().toISOString(),
      payload: { formData: { title: 'Test Draft 1' } },
    },
  ]

  const mockProfile = {
    id: 'test-user-id',
    username: 'testuser',
    display_name: 'Test User',
    avatar_url: null,
    bio: null,
    location_city: null,
    location_region: null,
    created_at: new Date().toISOString(),
    verified: false,
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

  it('should render ProfileSummaryCard with profile data', () => {
    const { container } = renderWithQueryClient(
      <DashboardClient
        initialSales={mockSales}
        initialDrafts={mockDrafts}
        initialProfile={mockProfile}
        initialMetrics={mockMetrics}
      />
    )
    
    // Check for profile summary elements (ProfileSummaryCard displays display_name read-only)
    expect(container.textContent).toContain('Test User')
    expect(container.textContent).toContain('Edit Profile')
    // Verify Edit Profile link exists
    const editProfileLink = screen.getByText('Edit Profile')
    expect(editProfileLink).toHaveAttribute('href', '/account/edit')
  })

  it('should render Drafts tab in SalesPanel with draft count', () => {
    const { container } = renderWithQueryClient(
      <DashboardClient
        initialSales={mockSales}
        initialDrafts={mockDrafts}
        initialProfile={mockProfile}
        initialMetrics={mockMetrics}
      />
    )
    
    // Check for drafts tab in sales panel
    expect(container.textContent).toContain('Your Sales')
    expect(container.textContent).toContain('Drafts')
    expect(container.textContent).toContain('1') // Draft count badge
  })

  it('should render SalesPanel with sales count and tabs', () => {
    const { container } = renderWithQueryClient(
      <DashboardClient
        initialSales={mockSales}
        initialDrafts={mockDrafts}
        initialProfile={mockProfile}
        initialMetrics={mockMetrics}
      />
    )
    
    // Check for sales panel with all tabs
    expect(container.textContent).toContain('Your Sales')
    expect(container.textContent).toContain('Live')
    expect(container.textContent).toContain('Archived')
    expect(container.textContent).toContain('Drafts')
    expect(container.textContent).toContain('2') // Live sales count
  })

  it('should render AnalyticsPanel', () => {
    const { container } = renderWithQueryClient(
      <DashboardClient
        initialSales={mockSales}
        initialDrafts={mockDrafts}
        initialProfile={mockProfile}
        initialMetrics={mockMetrics}
      />
    )
    
    // Check for analytics panel
    expect(container.textContent).toContain('Analytics')
  })
})

