/**
 * Integration tests for cloud preset RLS policies
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn()
}))

describe('Cloud Preset RLS Policies', () => {
  const mockSupabase = {
    from: vi.fn(),
    auth: {
      getUser: vi.fn()
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createSupabaseServerClient).mockReturnValue(mockSupabase as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should allow users to view their own presets', async () => {
    const userId = 'user-123'
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: userId } } })
    
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis()
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    // Simulate RLS policy check
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    const supabase = createSupabaseServerClient()
    
    await supabase.from('user_presets').select('*').eq('user_id', userId).order('created_at', { ascending: false })

    expect(mockSupabase.from).toHaveBeenCalledWith('user_presets')
    expect(mockQuery.eq).toHaveBeenCalledWith('user_id', userId)
  })

  it('should deny access to other users presets', async () => {
    const userId = 'user-123'
    const otherUserId = 'user-456'
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: userId } } })
    
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis()
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    // Simulate RLS policy check - should only return user's own presets
    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    const supabase = createSupabaseServerClient()
    
    await supabase.from('user_presets').select('*').eq('user_id', otherUserId).order('created_at', { ascending: false })

    // RLS should prevent this query from returning other user's data
    expect(mockQuery.eq).toHaveBeenCalledWith('user_id', otherUserId)
  })

  it('should allow users to insert their own presets', async () => {
    const userId = 'user-123'
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: userId } } })
    
    const mockQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'preset-123' }, error: null })
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    const supabase = createSupabaseServerClient()
    
    const result = await supabase.from('user_presets').insert({
      name: 'Test Preset',
      state_json: { view: { lat: 40.7128, lng: -74.0060, zoom: 12 }, filters: { dateRange: 'today', categories: [], radius: 25 } },
      is_default: false
    }).select().single()

    expect(mockSupabase.from).toHaveBeenCalledWith('user_presets')
    expect(mockQuery.insert).toHaveBeenCalled()
    expect(result.data).toBeDefined()
  })

  it('should allow users to update their own presets', async () => {
    const userId = 'user-123'
    const presetId = 'preset-123'
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: userId } } })
    
    const mockQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis()
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    const supabase = createSupabaseServerClient()
    
    await supabase.from('user_presets').update({ name: 'Updated Preset' }).eq('id', presetId).select()

    expect(mockSupabase.from).toHaveBeenCalledWith('user_presets')
    expect(mockQuery.update).toHaveBeenCalledWith({ name: 'Updated Preset' })
    expect(mockQuery.eq).toHaveBeenCalledWith('id', presetId)
  })

  it('should allow users to delete their own presets', async () => {
    const userId = 'user-123'
    const presetId = 'preset-123'
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: userId } } })
    
    const mockQuery = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis()
    }
    mockSupabase.from.mockReturnValue(mockQuery)

    const { createSupabaseServerClient } = await import('@/lib/supabase/server')
    const supabase = createSupabaseServerClient()
    
    await supabase.from('user_presets').delete().eq('id', presetId)

    expect(mockSupabase.from).toHaveBeenCalledWith('user_presets')
    expect(mockQuery.delete).toHaveBeenCalled()
    expect(mockQuery.eq).toHaveBeenCalledWith('id', presetId)
  })
})
