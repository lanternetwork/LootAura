'use client'
import { useEffect, useRef } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'

export function useRealtimeSales(onUpdate: (payload: any) => void) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabase = createSupabaseBrowserClient()

  useEffect(() => {
    // Subscribe to sales_v2 changes
    const channel = supabase
      .channel('sales_v2_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales_v2'
        },
        onUpdate
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [supabase, onUpdate])
}

export function useRealtimeFavorites(userId: string, onUpdate: (payload: any) => void) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabase = createSupabaseBrowserClient()

  useEffect(() => {
    if (!userId) return

    // Subscribe to favorites_v2 changes for this user
    const channel = supabase
      .channel('favorites_v2_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'favorites_v2',
          filter: `user_id=eq.${userId}`
        },
        onUpdate
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [supabase, userId, onUpdate])
}

export function useRealtimeReviews(saleId: string, onUpdate: (payload: any) => void) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabase = createSupabaseBrowserClient()

  useEffect(() => {
    if (!saleId) return

    // Subscribe to reviews_v2 changes for this sale
    const channel = supabase
      .channel('reviews_v2_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reviews_v2',
          filter: `sale_id=eq.${saleId}`
        },
        onUpdate
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [supabase, saleId, onUpdate])
}
