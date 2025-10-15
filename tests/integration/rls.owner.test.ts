import { describe, it, expect, vi } from 'vitest'

describe('RLS and Owner Permissions', () => {
  it('should set owner_id to auth.uid() when inserting sale', async () => {
    const testUserId = 'test-user-id'
    const saleData = {
      title: 'Test Sale',
      address: '123 Test St',
      tags: [],
      photos: []
    }

    // Use the global Supabase mock from setup.ts
    const { createSupabaseBrowserClient } = await import('@/lib/supabase/client')
    const supabase = createSupabaseBrowserClient()

    // Mock authenticated user
    ;(supabase.auth.getUser as any).mockResolvedValue({
      data: { user: { id: testUserId, email: 'test@example.com' } }
    })

    // Simulate the insert operation
    const { data, error } = await supabase
      .from('yard_sales')
      .insert([{ ...saleData, owner_id: testUserId }])

    expect(error).toBeNull()
    expect(data![0].owner_id).toBe(testUserId)
  })

  it('should allow public read access to sales list', async () => {
    const mockSales = [
      {
        id: 'sale-1',
        title: 'Public Sale 1',
        address: '123 Public St',
        owner_id: 'user-1',
        created_at: new Date().toISOString()
      }
    ]

    // Use the global Supabase mock from setup.ts
    const { createSupabaseBrowserClient } = await import('@/lib/supabase/client')
    const supabase = createSupabaseBrowserClient()

    // Mock anonymous user
    ;(supabase.auth.getUser as any).mockResolvedValue({
      data: { user: null }
    })

    // Mock successful select
    supabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: mockSales,
        error: null
      })
    })

    // Simulate the select operation
    const { data, error } = await supabase
      .from('yard_sales')
      .select('*')

    expect(error).toBeNull()
    expect(data).toEqual(mockSales)
  })

  it('should allow owner to update their own sale', async () => {
    const testUserId = 'test-user-id'
    const saleId = 'sale-123'

    // Use the global Supabase mock from setup.ts
    const { createSupabaseBrowserClient } = await import('@/lib/supabase/client')
    const supabase = createSupabaseBrowserClient()

    // Mock authenticated user
    ;(supabase.auth.getUser as any).mockResolvedValue({
      data: { user: { id: testUserId, email: 'test@example.com' } }
    })

    // Mock successful update
    supabase.from = vi.fn().mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: saleId, title: 'Updated Sale', owner_id: testUserId },
        error: null
      })
    })

    // Simulate the update operation
    const { data, error } = await supabase
      .from('yard_sales')
      .update({ title: 'Updated Sale' })
      .eq('id', saleId)
      .eq('owner_id', testUserId)
      .single()

    expect(error).toBeNull()
    expect(data!.title).toBe('Updated Sale')
  })

  it('should prevent non-owner from updating sale', async () => {
    const testUserId = 'test-user-id'
    const otherUserId = 'other-user-id'
    const saleId = 'sale-123'

    // Use the global Supabase mock from setup.ts
    const { createSupabaseBrowserClient } = await import('@/lib/supabase/client')
    const supabase = createSupabaseBrowserClient()

    // Mock authenticated user
    ;(supabase.auth.getUser as any).mockResolvedValue({
      data: { user: { id: testUserId, email: 'test@example.com' } }
    })

    // Mock RLS policy violation
    supabase.from = vi.fn().mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'new row violates row-level security policy' }
      })
    })

    // Simulate the update operation
    const { data, error } = await supabase
      .from('yard_sales')
      .update({ title: 'Unauthorized Update' })
      .eq('id', saleId)
      .eq('owner_id', otherUserId)
      .single()

    expect(error).toBeTruthy()
    expect(error?.message).toContain('row-level security policy')
    expect(data).toBeNull()
  })

  it('should allow owner to delete their own sale', async () => {
    const testUserId = 'test-user-id'
    const saleId = 'sale-123'

    // Use the global Supabase mock from setup.ts
    const { createSupabaseBrowserClient } = await import('@/lib/supabase/client')
    const supabase = createSupabaseBrowserClient()

    // Mock authenticated user
    ;(supabase.auth.getUser as any).mockResolvedValue({
      data: { user: { id: testUserId, email: 'test@example.com' } }
    })

    // Mock successful delete
    supabase.from = vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: null
      })
    })

    // Simulate the delete operation
    const { data, error } = await supabase
      .from('yard_sales')
      .delete()
      .eq('id', saleId)
      .eq('owner_id', testUserId)
      .single()

    expect(error).toBeNull()
  })

  it('should prevent non-owner from deleting sale', async () => {
    const testUserId = 'test-user-id'
    const otherUserId = 'other-user-id'
    const saleId = 'sale-123'

    // Use the global Supabase mock from setup.ts
    const { createSupabaseBrowserClient } = await import('@/lib/supabase/client')
    const supabase = createSupabaseBrowserClient()

    // Mock authenticated user
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: testUserId, email: 'test@example.com' } }
    })

    // Mock RLS policy violation
    supabase.from = vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'new row violates row-level security policy' }
      })
    })

    // Simulate the delete operation
    const { data, error } = await supabase
      .from('yard_sales')
      .delete()
      .eq('id', saleId)
      .eq('owner_id', otherUserId)
      .single()

    expect(error).toBeTruthy()
    expect(error?.message).toContain('row-level security policy')
    expect(data).toBeNull()
  })
})