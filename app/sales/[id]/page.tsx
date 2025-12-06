import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSaleWithItems, getNearestSalesForSale } from '@/lib/data/salesAccess'
import { getUserRatingForSeller } from '@/lib/data/ratingsAccess'
import SaleDetailClient from './SaleDetailClient'
import { createSaleMetadata, createSaleEventStructuredData, createBreadcrumbStructuredData } from '@/lib/metadata'

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
  
  // Log items being passed to client (only in debug mode)
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    const { logger } = await import('@/lib/log')
    logger.debug('Sale detail page rendering', {
      component: 'sales/[id]/page',
      saleId: params.id,
      itemsCount: items.length,
      saleStatus: sale.status,
      items: items.map(i => ({ 
        id: i.id, 
        name: i.name, 
        hasPhoto: !!i.photo,
        photoValue: i.photo ? `${i.photo.substring(0, 50)}...` : null,
        photoType: typeof i.photo,
        photoLength: i.photo?.length || 0,
      })),
      note: 'Verify photo field is populated and passed to ItemImage component',
    })
  }

  // Compute union of sale-level categories (tags) and item categories.
  // Normalize tags so we handle both text[] and comma-separated strings safely.
  const rawTags = (sale as any).tags
  const saleCats = Array.isArray(rawTags)
    ? rawTags
    : typeof rawTags === 'string'
      ? rawTags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []
  const itemCats = items.map(i => i.category).filter((cat): cat is string => Boolean(cat))
  const displayCategories = Array.from(new Set([...saleCats, ...itemCats])).sort()

  // Fetch nearby sales (non-blocking - if it fails, we just don't show the card)
  const nearbySales = await getNearestSalesForSale(supabase, params.id, 2).catch(() => [])

  // Fetch current user's rating for this seller (if authenticated)
  let currentUserRating: number | null = null
  if (sale.owner_id) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user && user.id !== sale.owner_id) {
      currentUserRating = await getUserRatingForSeller(supabase, sale.owner_id, user.id).catch(() => null)
    }
  }

  const _metadata = createSaleMetadata(sale)
  
  // Create structured data for SEO
  const eventStructuredData = createSaleEventStructuredData(sale)
  const breadcrumbStructuredData = createBreadcrumbStructuredData([
    { name: 'Home', url: '/' },
    { name: 'Sales', url: '/sales' },
    { name: sale.title || 'Sale', url: `/sales/${sale.id}` },
  ])

  return (
    <div className="min-h-screen bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbStructuredData) }}
      />
      <Suspense fallback={<div className="p-4">Loading...</div>}>
        <SaleDetailClient 
          sale={sale} 
          displayCategories={displayCategories} 
          items={items} 
          nearbySales={nearbySales}
          currentUserRating={currentUserRating}
        />
      </Suspense>
    </div>
  )
}

export async function generateMetadata({ params }: SaleDetailPageProps): Promise<Metadata> {
  const supabase = createSupabaseServerClient()
  const result = await getSaleWithItems(supabase, params.id)
  
  if (!result) {
    return {
      title: 'Sale not found · LootAura',
      description: 'This sale no longer exists or is not available.',
      openGraph: {
        title: 'Sale not found · LootAura',
        description: 'This sale no longer exists or is not available.',
        type: 'website',
      },
      twitter: {
        card: 'summary',
        title: 'Sale not found · LootAura',
        description: 'This sale no longer exists or is not available.',
      },
    }
  }

  // Compute categories from sale tags and item categories (same logic as page component).
  const rawTags = (result.sale as any).tags
  const saleCats = Array.isArray(rawTags)
    ? rawTags
    : typeof rawTags === 'string'
      ? rawTags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []
  const itemCats = result.items.map(i => i.category).filter((cat): cat is string => Boolean(cat))
  const displayCategories = Array.from(new Set([...saleCats, ...itemCats])).sort()

  return createSaleMetadata(result.sale, { categories: displayCategories })
}
