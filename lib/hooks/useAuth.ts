import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Profile, Sale } from '@/lib/types'
import { ProfileSchema } from '@/lib/zodSchemas'

const sb = createSupabaseBrowserClient()

export function useAuth() {
  return useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      const { data: { user }, error } = await sb.auth.getUser()
      if (error) {
        throw new Error(error.message)
      }
      return user
    },
    staleTime: 5 * 60 * 1000, // Consider auth data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes (formerly cacheTime)
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnMount: false, // Don't refetch on component mount if data exists
    refetchOnReconnect: true, // Only refetch on network reconnect
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
        .select('id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, home_zip, preferences')
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

      // Step 2: fetch sales from public view
      const { data: salesRows, error: salesErr } = await sb
        .from('sales_v2')
        .select('*')
        .in('id', ids)

      if (salesErr) throw new Error(salesErr.message)

      return salesRows as Sale[]
    },
    enabled: !!user,
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()
  const { data: user } = useAuth()

  return useMutation({
    mutationFn: async ({ saleId, isFavorited: _isFavorited }: { saleId: string; isFavorited: boolean }) => {
      if (!user) throw new Error('Please sign in to save favorites')

      // Use API route for consistency with SaleDetailClient
      const response = await fetch(`/api/sales/${saleId}/favorite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to toggle favorite' }))
        throw new Error(errorData.error || 'Failed to toggle favorite')
      }

      const result = await response.json()
      return result
    },
    onSuccess: () => {
      // Invalidate with user ID to match useFavorites query key
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ['favorites', user.id] })
      }
      // Also invalidate general favorites queries
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
  })
}
