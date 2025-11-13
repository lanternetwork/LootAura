/**
 * @vitest-environment jsdom
 * 
 * NOTE: Profile editing has been moved to /account/edit page.
 * The dashboard now shows a read-only ProfileSummaryCard with an "Edit Profile" link.
 * These tests verify the dashboard displays the profile summary correctly.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DashboardClient from '@/app/(dashboard)/dashboard/DashboardClient'
import type { ProfileData } from '@/lib/data/profileAccess'

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

describe('Dashboard Profile Summary', () => {
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
    renderWithQueryClient(
      <DashboardClient
        initialSales={mockSales}
        initialProfile={mockProfile}
        initialMetrics={mockMetrics}
      />
    )
    
    // ProfileSummaryCard displays profile information read-only
    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByText('@testuser')).toBeInTheDocument()
    // Location is rendered as "Louisville, KY" but may be split across text nodes
    expect(screen.getByText(/Louisville/)).toBeInTheDocument()
    expect(screen.getByText(/KY/)).toBeInTheDocument()
    
    // Should have "Edit Profile" link (not button) that goes to /account/edit
    const editProfileLink = screen.getByText('Edit Profile')
    expect(editProfileLink).toBeInTheDocument()
    expect(editProfileLink).toHaveAttribute('href', '/account/edit')
  })

  it('should render Edit Profile link that navigates to edit page', () => {
    renderWithQueryClient(
      <DashboardClient
        initialSales={mockSales}
        initialProfile={mockProfile}
        initialMetrics={mockMetrics}
      />
    )
    
    // Verify Edit Profile link exists and points to /account/edit
    const editProfileLink = screen.getByText('Edit Profile')
    expect(editProfileLink.tagName).toBe('A')
    expect(editProfileLink).toHaveAttribute('href', '/account/edit')
  })
})

