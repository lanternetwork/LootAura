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
  })
}

export function useProfile() {
  const { data: user } = useAuth()
  
  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null

      const { data, error } = await sb
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

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

      // Use schema-aware table name
      const schema = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public'
      const favoritesTable = schema === 'public' ? 'favorites_v2' : 'favorites'

      const { data, error } = await sb
        .from(favoritesTable)
        .select(`
          sale_id,
          sales:sale_id (*)
        `)
        .eq('user_id', user.id)

      if (error) {
        throw new Error(error.message)
      }

      return data?.map((fav: any) => fav.sales).filter(Boolean) as Sale[] || []
    },
    enabled: !!user,
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()
  const { data: user } = useAuth()

  return useMutation({
    mutationFn: async ({ saleId, isFavorited }: { saleId: string; isFavorited: boolean }) => {
      if (!user) {
        throw new Error('Please sign in to save favorites')
      }

      // Use schema-aware table name
      const schema = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public'
      const favoritesTable = schema === 'public' ? 'favorites_v2' : 'favorites'

      if (isFavorited) {
        const { error } = await sb
          .from(favoritesTable)
          .delete()
          .eq('user_id', user.id)
          .eq('sale_id', saleId)

        if (error) {
          throw new Error(error.message)
        }
      } else {
        const { error } = await sb
          .from(favoritesTable)
          .insert({ user_id: user.id, sale_id: saleId })

        if (error) {
          throw new Error(error.message)
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
  })
}
