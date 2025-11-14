import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSaleWithItems, getNearestSalesForSale } from '@/lib/data/salesAccess'
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

  // Compute union of sale-level categories (tags) and item categories
  const saleCats = Array.isArray(sale.tags) ? sale.tags : []
  const itemCats = items.map(i => i.category).filter((cat): cat is string => Boolean(cat))
  const displayCategories = Array.from(new Set([...saleCats, ...itemCats])).sort()

  // Fetch nearby sales (non-blocking - if it fails, we just don't show the card)
  const nearbySales = await getNearestSalesForSale(supabase, params.id, 2).catch(() => [])

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
        <SaleDetailClient sale={sale} displayCategories={displayCategories} items={items} nearbySales={nearbySales} />
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

  // Compute categories from sale tags and item categories (same logic as page component)
  const saleCats = Array.isArray(result.sale.tags) ? result.sale.tags : []
  const itemCats = result.items.map(i => i.category).filter((cat): cat is string => Boolean(cat))
  const displayCategories = Array.from(new Set([...saleCats, ...itemCats])).sort()

  return createSaleMetadata(result.sale, { categories: displayCategories })
}
