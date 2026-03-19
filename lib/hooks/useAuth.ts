import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Profile, Sale } from '@/lib/types'
import { ProfileSchema } from '@/lib/zodSchemas'
import { getCsrfHeaders } from '@/lib/csrf-client'

const sb = createSupabaseBrowserClient()

export function useAuth() {
  return useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      try {
        const { data: { user }, error } = await sb.auth.getUser()
        if (error) {
          // Don't throw on auth errors - just return null (user is not authenticated)
          // This prevents the query from being in a permanent error state
          return null
        }
        return user
      } catch (error) {
        // Network errors or other issues - return null instead of throwing
        // This allows the UI to show "Sign In" button instead of being stuck loading
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.warn('[useAuth] Error fetching user:', error)
        }
        return null
      }
    },
    staleTime: 5 * 60 * 1000, // Consider auth data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes (formerly cacheTime)
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnMount: false, // Don't refetch on component mount if data exists
    refetchOnReconnect: true, // Only refetch on network reconnect
    retry: 1, // Only retry once on failure
    retryDelay: 1000, // Wait 1 second before retry
  })
}

export function useProfile() {
  const { data: user } = useAuth()
  
  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null

      // Use profiles_v2 view instead of direct profiles table to avoid RLS/schema issues
      const { data, error } = await sb
        .from('profiles_v2')
        .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, home_zip, preferences, is_locked, lock_reason')
        .eq('id', user.id)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') { // Not found error
        throw new Error(error.message)
      }

      return data as Profile | null
    },
    enabled: !!user,
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (profileData: Partial<Profile>) => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) {
        throw new Error('Not authenticated')
      }

      const parsed = ProfileSchema.partial().safeParse(profileData)
      if (!parsed.success) {
        throw new Error('Invalid profile data')
      }

      const { data, error } = await sb
        .from('profiles')
        .upsert({ id: user.id, ...parsed.data })
        .select()
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data as Profile
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useSignIn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useSignUp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await sb.auth.signUp({
        email,
        password
      })

      if (error) {
        throw new Error(error.message)
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] })
    },
  })
}

export function useSignOut() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { error } = await sb.auth.signOut()
      if (error) {
        throw new Error(error.message)
      }
    },
    onSuccess: () => {
      queryClient.clear()
    },
  })
}

export function useFavorites() {
  const { data: user } = useAuth()
  
  return useQuery({
    queryKey: ['favorites', user?.id],
    queryFn: async () => {
      if (!user) return []

      // Step 1: get favorite sale_ids from public view
      const { data: favRows, error: favErr } = await sb
        .from('favorites_v2')
        .select('sale_id')
        .eq('user_id', user.id)

      if (favErr) throw new Error(favErr.message)

      const ids = (favRows || []).map((r: any) => r.sale_id)
      if (ids.length === 0) return []

      // Step 2: fetch sales from public view, then filter out archived sales client-side
      const { data: salesRows, error: salesErr } = await sb
        .from('sales_v2')
        .select('*')
        .in('id', ids)

      if (salesErr) throw new Error(salesErr.message)

      // Filter out archived sales from favorites client-side
      const activeSales = (salesRows || []).filter((sale: Sale) => {
        // Exclude archived sales
        if (sale.status === 'archived' || sale.archived_at) {
          return false
        }
        // Only include published sales (status can be 'draft', 'published', 'archived', or 'active')
        return sale.status === 'published'
      })

      return activeSales as Sale[]
    },
    enabled: !!user,
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()
  const { data: user } = useAuth()

  const tryFindSaleInCache = (saleId: string): Sale | null => {
    // Best-effort: attempt to reuse existing cached sale objects so the favorites list can update immediately.
    // This is intentionally conservative: if we can't find a full `Sale`, we fall back to invalidation/refetch.
    const exactSale = queryClient.getQueryData(['sale', saleId] as any) as Sale | undefined
    if (exactSale && exactSale.id === saleId) return exactSale

    const salesLists = queryClient.getQueriesData({ queryKey: ['sales'], exact: false } as any) as Array<[any, any]>
    for (const [, data] of salesLists) {
      if (!Array.isArray(data)) continue
      const found = data.find((s: any) => s && s.id === saleId)
      if (found) return found as Sale
    }

    return null
  }

  return useMutation({
    mutationFn: async ({ saleId, isFavorited: _isFavorited }: { saleId: string; isFavorited: boolean }) => {
      if (!user) throw new Error('Please sign in to save favorites')

      // Use API route for consistency with SaleDetailClient
      const response = await fetch(`/api/sales/${saleId}/favorite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getCsrfHeaders(),
        },
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to toggle favorite' }))
        throw new Error(errorData.error || 'Failed to toggle favorite')
      }

      const result = await response.json()
      return result
    },
    onSuccess: (result: any, variables: { saleId: string; isFavorited: boolean }) => {
      const userId = user?.id
      const saleId = variables.saleId
      const favoritedFromServer = typeof result?.favorited === 'boolean' ? result.favorited : variables.isFavorited

      // Immediate cache sync: ensures Favorites tab can reflect the toggle without waiting for refetch.
      if (userId) {
        const saleFromCache = favoritedFromServer ? tryFindSaleInCache(saleId) : null

        queryClient.setQueryData(['favorites', userId], (old: Sale[] | undefined) => {
          const prev = Array.isArray(old) ? old : []
          const exists = prev.some(s => s?.id === saleId)

          if (favoritedFromServer) {
            if (exists) return prev
            if (!saleFromCache) return prev // can't construct a correct Sale object -> rely on refetch
            return [saleFromCache, ...prev]
          }

          // Unfavorite
          if (!exists) return prev
          return prev.filter(s => s?.id !== saleId)
        })
      }

      // Safety net: invalidate with user ID to match useFavorites query key
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['favorites', userId] })
      }
      // Also invalidate general favorites queries
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
  })
}
