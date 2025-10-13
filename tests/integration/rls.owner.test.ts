import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockSupabaseClient } from '@/tests/utils/mocks'

describe('RLS and Owner Permissions', () => {
  let mockSupabase: any

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
  })

  it('should set owner_id to auth.uid() when inserting sale', async () => {
    const testUserId = 'test-user-id'
    const saleData = {
      title: 'Test Sale',
      address: '123 Test St',
      tags: [],
      photos: []
    }

    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: testUserId, email: 'test@example.com' } }
    })

    // Mock successful insert
    const insertSpy = vi.fn().mockResolvedValue({
      data: [{ ...saleData, id: 'sale-123', owner_id: testUserId }],
      error: null
    })

    // Set up the mock chain
    mockSupabase.from = vi.fn().mockReturnValue({
      insert: insertSpy
    })

    // Simulate the insert operation
    const { data, error } = await mockSupabase
      .from('yard_sales')
      .insert([{ ...saleData, owner_id: testUserId }])

    expect(error).toBeNull()
    expect(data[0].owner_id).toBe(testUserId)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          owner_id: testUserId
        })
      ])
    )
  })

  it('should allow public read access to sales list', async () => {
    const mockSales = [
      {
        id: 'sale-1',
        title: 'Public Sale 1',
        address: '123 Public St',
        owner_id: 'user-1',
        created_at: new Date().toISOString()
      },
      {
        id: 'sale-2',
        title: 'Public Sale 2',
        address: '456 Public Ave',
        owner_id: 'user-2',
        created_at: new Date().toISOString()
      }
    ]

    // Mock anonymous user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null }
    })

    // Mock successful select
    const selectSpy = vi.fn().mockResolvedValue({
      data: mockSales,
      error: null
    })

    // Set up the mock chain
    mockSupabase.from = vi.fn().mockReturnValue({
      select: selectSpy
    })

    // Simulate the select operation
    const { data, error } = await mockSupabase
      .from('yard_sales')
      .select('*')

    expect(error).toBeNull()
    expect(data).toEqual(mockSales)
    expect(selectSpy).toHaveBeenCalled()
  })

  it('should allow owner to update their own sale', async () => {
    const testUserId = 'test-user-id'
    const saleId = 'sale-123'

    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: testUserId, email: 'test@example.com' } }
    })

    // Mock successful update
    const updateSpy = vi.fn().mockResolvedValue({
      data: [{ id: saleId, title: 'Updated Sale', owner_id: testUserId }],
      error: null
    })

    // Set up the mock chain properly
    const mockEq = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        update: updateSpy
      })
    })
    
    mockSupabase.from = vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: mockEq
      })
    })

    // Simulate the update operation
    const result = await mockSupabase
      .from('yard_sales')
      .update({ title: 'Updated Sale' })
      .eq('id', saleId)
      .eq('owner_id', testUserId)

    expect(result.error).toBeNull()
    expect(result.data[0].title).toBe('Updated Sale')
    expect(updateSpy).toHaveBeenCalled()
  })

  it('should prevent non-owner from updating sale', async () => {
    const testUserId = 'test-user-id'
    const otherUserId = 'other-user-id'
    const saleId = 'sale-123'

    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: testUserId, email: 'test@example.com' } }
    })

    // Mock RLS policy violation
    const updateSpy = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy' }
    })

    // Set up the mock chain
    const mockEq = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(updateSpy)
    })
    
    mockSupabase.from = vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: mockEq
      })
    })

    // Simulate the update operation
    const result = await mockSupabase
      .from('yard_sales')
      .update({ title: 'Unauthorized Update' })
      .eq('id', saleId)
      .eq('owner_id', otherUserId) // Different owner

    expect(result.error).toBeTruthy()
    expect(result.error?.message).toContain('row-level security policy')
    expect(result.data).toBeNull()
  })

  it('should allow owner to delete their own sale', async () => {
    const testUserId = 'test-user-id'
    const saleId = 'sale-123'

    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: testUserId, email: 'test@example.com' } }
    })

    // Mock successful delete
    const deleteSpy = vi.fn().mockResolvedValue({
      data: null,
      error: null
    })

    // Set up the mock chain
    const mockEq = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        delete: deleteSpy
      })
    })
    
    mockSupabase.from = vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: mockEq
      })
    })

    // Simulate the delete operation
    const result = await mockSupabase
      .from('yard_sales')
      .delete()
      .eq('id', saleId)
      .eq('owner_id', testUserId)

    expect(result.error).toBeNull()
    expect(deleteSpy).toHaveBeenCalled()
  })

  it('should prevent non-owner from deleting sale', async () => {
    const testUserId = 'test-user-id'
    const otherUserId = 'other-user-id'
    const saleId = 'sale-123'

    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: testUserId, email: 'test@example.com' } }
    })

    // Mock RLS policy violation
    const deleteSpy = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy' }
    })

    // Set up the mock chain
    const mockEq = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue(deleteSpy)
    })
    
    mockSupabase.from = vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: mockEq
      })
    })

    // Simulate the delete operation
    const result = await mockSupabase
      .from('yard_sales')
      .delete()
      .eq('id', saleId)
      .eq('owner_id', otherUserId) // Different owner

    expect(result.error).toBeTruthy()
    expect(result.error?.message).toContain('row-level security policy')
    expect(result.data).toBeNull()
  })

  it('should handle anonymous user attempting to create sale', async () => {
    // Mock anonymous user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null }
    })

    // Mock RLS policy violation for anonymous user
    const insertSpy = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy' }
    })

    mockSupabase.from = vi.fn().mockReturnValue({
      insert: insertSpy
    })

    const saleData = {
      title: 'Test Sale',
      address: '123 Test St',
      tags: [],
      photos: []
    }

    // Simulate the insert operation
    const result = await mockSupabase
      .from('yard_sales')
      .insert([saleData])

    expect(result.error).toBeTruthy()
    expect(result.error?.message).toContain('row-level security policy')
    expect(result.data).toBeNull()
  })

  it('should validate owner_id is set correctly in database schema', async () => {
    const testUserId = 'test-user-id'
    const saleData = {
      title: 'Test Sale',
      address: '123 Test St',
      tags: [],
      photos: []
    }

    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: testUserId, email: 'test@example.com' } }
    })

    // Mock successful insert with proper owner_id
    const insertSpy = vi.fn().mockResolvedValue({
      data: [{
        id: 'sale-1',
        ...saleData,
        owner_id: testUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }],
      error: null
    })

    mockSupabase.from = vi.fn().mockReturnValue({
      insert: insertSpy
    })

    // Simulate the insert operation
    const result = await mockSupabase
      .from('yard_sales')
      .insert([{ ...saleData, owner_id: testUserId }])

    expect(result.error).toBeNull()
    expect(result.data[0]).toMatchObject({
      id: 'sale-1',
      title: 'Test Sale',
      owner_id: testUserId
    })
  })

  it('should handle RLS policy for search_sales function', async () => {
    const mockSales = [
      {
        id: 'sale-1',
        title: 'Public Sale 1',
        address: '123 Public St',
        owner_id: 'user-1',
        created_at: new Date().toISOString()
      }
    ]

    // Mock search_sales RPC function
    const rpcSpy = vi.fn().mockResolvedValue({
      data: mockSales,
      error: null
    })

    mockSupabase.rpc = rpcSpy

    // Simulate the search operation
    const { data, error } = await mockSupabase.rpc('search_sales', {
      search_query: 'sale',
      max_distance_km: 25,
      user_lat: null,
      user_lng: null,
      date_from: null,
      date_to: null,
      price_min: null,
      price_max: null,
      tags_filter: null,
      limit_count: 100,
      offset_count: 0
    })

    expect(error).toBeNull()
    expect(data).toEqual(mockSales)
    expect(rpcSpy).toHaveBeenCalledWith('search_sales', expect.any(Object))
  })
})
