import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSaleWithItems } from '@/lib/data/salesAccess'
import SaleDetailClient from './SaleDetailClient'
import { createSaleMetadata } from '@/lib/metadata'

interface SaleDetailPageProps {
  params: {
    id: string
  }
}

export default async function SaleDetailPage({ params }: SaleDetailPageProps) {
  const supabase = createSupabaseServerClient()
  const result = await getSaleWithItems(supabase, params.id)

  if (!result) {
    notFound()
  }

  const { sale, items } = result

  // Compute union of sale-level categories (tags) and item categories
  const saleCats = Array.isArray(sale.tags) ? sale.tags : []
  const itemCats = items.map(i => i.category).filter((cat): cat is string => Boolean(cat))
  const displayCategories = Array.from(new Set([...saleCats, ...itemCats])).sort()

  // Always log in production for debugging (can remove later)
  console.log('[SALE_DETAILS] Categories debug:', {
    saleId: params.id,
    saleTags: sale.tags,
    saleCats,
    itemCats,
    displayCategories,
    itemsCount: items.length,
  })

  const _metadata = createSaleMetadata(sale)

  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={<div className="p-4">Loading...</div>}>
        <SaleDetailClient sale={sale} displayCategories={displayCategories} items={items} />
      </Suspense>
    </div>
  )
}

export async function generateMetadata({ params }: SaleDetailPageProps) {
  const supabase = createSupabaseServerClient()
  const result = await getSaleWithItems(supabase, params.id)
  
  if (!result) {
    return {
      title: 'Sale Not Found',
      description: 'The requested sale could not be found.'
    }
  }

  return createSaleMetadata(result.sale)
}
