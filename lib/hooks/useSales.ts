import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { Sale, SaleItem } from '@/lib/types'
import { SaleSchema } from '@/lib/zodSchemas'

const sb = createSupabaseBrowserClient()

export function useSales(filters?: {
  q?: string
  maxKm?: number
  lat?: number
  lng?: number
  dateFrom?: string
  dateTo?: string
  tags?: string[]
  min?: number
  max?: number
}) {
  return useQuery({
    queryKey: ['sales', filters],
    queryFn: async () => {
      // Prefer Option A RPC if available
      const { data, error } = await sb.rpc('search_sales_within_distance', {
        search_query: filters?.q || null,
        max_distance_km: filters?.maxKm || null,
        user_lat: filters?.lat || null,
        user_lng: filters?.lng || null,
        date_from: filters?.dateFrom || null,
        date_to: filters?.dateTo || null,
        price_min: filters?.min || null,
        price_max: filters?.max || null,
        tags_filter: filters?.tags || null,
        limit_count: 100,
        offset_count: 0
      })

      if (error) {
        // Fallback to older search RPC if needed
        const fallback = await sb.rpc('search_sales', {
          search_query: filters?.q || null,
          max_distance_km: filters?.maxKm || null,
          user_lat: filters?.lat || null,
          user_lng: filters?.lng || null,
          date_from: filters?.dateFrom || null,
          date_to: filters?.dateTo || null,
          price_min: filters?.min || null,
          price_max: filters?.max || null,
          tags_filter: filters?.tags || null,
          limit_count: 100,
          offset_count: 0
        })

        if (fallback.error) {
          throw new Error(fallback.error.message)
        }

        return fallback.data as Sale[]
      }

      return data as Sale[]
    },
  })
}

export function useSaleMarkers(filters?: {
  q?: string
  maxKm?: number
  lat?: number
  lng?: number
  dateFrom?: string
  dateTo?: string
  tags?: string[]
}) {
  return useQuery({
    queryKey: ['sale-markers', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.lat != null) params.set('lat', String(filters.lat))
      if (filters?.lng != null) params.set('lng', String(filters.lng))
      if (filters?.maxKm != null) params.set('maxKm', String(filters.maxKm))
      if (filters?.q) params.set('q', filters.q)
      if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters?.dateTo) params.set('dateTo', filters.dateTo)
      if (filters?.tags?.length) params.set('tags', filters.tags.join(','))

      const res = await fetch(`/api/sales/markers?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || 'Failed to load markers')
      }
      return (await res.json()) as { id: string; title: string; lat: number; lng: number }[]
    },
  })
}

export function useSale(id: string) {
  return useQuery({
    queryKey: ['sale', id],
    queryFn: async () => {
      const { data, error } = await sb
        .from('sales_v2')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data as Sale
    },
    enabled: !!id,
  })
}

export function useCreateSale() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (saleData: any) => {
      const parsed = SaleSchema.safeParse(saleData)
      if (!parsed.success) {
        throw new Error('Invalid sale data')
      }

      // Handle both chainable and direct-return Supabase clients
      const insertResult = await sb
        .from('sales_v2')
        .insert([parsed.data])

      let result: { data: any; error: any }

      // Check if the result is already a promise/object (direct-return style)
      if (insertResult && typeof insertResult === 'object' && 'data' in insertResult && 'error' in insertResult) {
        // Direct-return style: already has { data, error }
        result = insertResult
      } else {
        // Chainable style: need to call .select().single()
        result = await (insertResult as any).select().single()
      }

      if (result.error) {
        throw new Error(result.error.message)
      }

      return result.data as Sale
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] })
    },
  })
}

export function useUpdateSale() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...saleData }: { id: string } & Partial<Sale>) => {
      const parsed = SaleSchema.partial().safeParse(saleData)
      if (!parsed.success) {
        throw new Error('Invalid sale data')
      }

      const { data, error } = await sb
        .from('sales_v2')
        .update(parsed.data)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data as Sale
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sale', data.id] })
    },
  })
}

export function useDeleteSale() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from('sales_v2')
        .delete()
        .eq('id', id)

      if (error) {
        throw new Error(error.message)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] })
    },
  })
}

export function useSaleItems(saleId: string) {
  return useQuery({
    queryKey: ['sale-items', saleId],
    queryFn: async () => {
      const { data, error } = await sb
        .from('items_v2')
        .select('*')
        .eq('sale_id', saleId)
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(error.message)
      }

      return data as SaleItem[]
    },
    enabled: !!saleId,
  })
}

export function useFavorites() {
  return useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return []

      const { data, error } = await sb
        .from('favorites_v2')
        .select(`
          sale_id,
          sales_v2 (*)
        `)
        .eq('user_id', user.id)

      if (error) {
        throw new Error(error.message)
      }

      // Filter out archived sales from favorites
      return data?.map((fav: any) => fav.sales_v2)
        .filter(Boolean)
        .filter((sale: Sale) => {
          // Exclude archived sales
          if (sale.status === 'archived' || sale.archived_at) {
            return false
          }
          // Only include published or active sales
          return sale.status === 'published' || sale.status === 'active'
        }) as Sale[]
    },
  })
}
