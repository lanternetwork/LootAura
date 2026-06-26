import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { type NearestSalesCoords } from '@/lib/data/salesAccess'
import { getSaleWithItemsForRequest } from '@/lib/data/saleDetailLoader'
import SaleDetailClient from './SaleDetailClient'
import SaleDetailNearbySales from './SaleDetailNearbySales'
import SaleDetailSellerActivity from './SaleDetailSellerActivity'
import SaleDetailSsrContent from '@/components/seo/SaleDetailSsrContent'
import { SellerActivityCard } from '@/components/sales/SellerActivityCard'
import { createSaleEventStructuredData, createBreadcrumbStructuredData } from '@/lib/metadata'
import { createListingSeoMetadata } from '@/lib/seo/metadata'
import { resolveListingIndexRobots } from '@/lib/seo/indexRollout'
import { isSaleSeoIndexEligible } from '@/lib/seo/isSaleSeoIndexEligible'
import { getInventorySeoEmissionForRequest } from '@/lib/seo/resolveInventorySeoEmission'
import { loadIngestedEligibilityFlagsForPublishedSale } from '@/lib/seo/sitemap/fetchPublishedListingRows'
import {
  buildListingBreadcrumbItems,
  buildListingGeoLinks,
} from '@/lib/seo/geoLinking'

interface SaleDetailPageProps {
  params: Promise<{ id: string }>
}

function isSaleLocallySeoEligible(sale: any): boolean {
  return isSaleSeoIndexEligible({
    status: sale?.status,
    archived_at: sale?.archived_at,
    moderation_status: sale?.moderation_status,
    ends_at: sale?.ends_at,
    external_source_url: sale?.external_source_url,
    lat: sale?.lat,
    lng: sale?.lng,
  })
}

function getSaleNearestCoords(sale: { lat?: number | null; lng?: number | null }): NearestSalesCoords | undefined {
  if (
    typeof sale.lat === 'number' &&
    typeof sale.lng === 'number' &&
    !isNaN(sale.lat) &&
    !isNaN(sale.lng)
  ) {
    return { lat: sale.lat, lng: sale.lng }
  }
  return undefined
}

export default async function SaleDetailPage({ params }: SaleDetailPageProps) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || []
  const isDebugAdmin = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEBUG === 'true'
  const isAdmin = !!(user?.email && adminEmails.includes(user.email.toLowerCase())) || isDebugAdmin
  const result = await getSaleWithItemsForRequest(id)

  if (!result) {
    notFound()
  }

  const { sale, items } = result

  // Block hidden sales for non-admins
  if ((sale as any).moderation_status === 'hidden_by_admin' && !isAdmin) {
    notFound()
  }
  
  // Log items being passed to client (only in debug mode)
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    const { logger } = await import('@/lib/log')
    logger.debug('Sale detail page rendering', {
      component: 'sales/[id]/page',
      saleId: id,
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

  const saleCoords = getSaleNearestCoords(sale)
  const listingGeoLinks = buildListingGeoLinks(sale)
  const viewerUserId = user?.id ?? null

  const sellerActivityFallback = (
    <SellerActivityCard
      ownerProfile={sale.owner_profile}
      ownerStats={sale.owner_stats}
      currentUserRating={null}
      saleId={sale.id}
    />
  )

  // Create structured data for SEO
  const eventStructuredData = createSaleEventStructuredData(sale)
  const breadcrumbStructuredData = createBreadcrumbStructuredData(
    buildListingBreadcrumbItems(sale)
  )

  const promotionsEnabled = process.env.PROMOTIONS_ENABLED === 'true'
  const paymentsEnabled = process.env.PAYMENTS_ENABLED === 'true'

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
      <div className="sr-only" aria-label="Sale listing details">
        <SaleDetailSsrContent
          sale={sale}
          items={items}
          geoLinks={listingGeoLinks}
          nearbyListingLinks={[]}
        />
      </div>
      <SaleDetailClient
        sale={sale}
        displayCategories={displayCategories}
        items={items}
        promotionsEnabled={promotionsEnabled}
        paymentsEnabled={paymentsEnabled}
        sellerActivitySection={
          <Suspense fallback={sellerActivityFallback}>
            <SaleDetailSellerActivity sale={sale} viewerUserId={viewerUserId} />
          </Suspense>
        }
        nearbySalesMobileSection={
          saleCoords ? (
            <Suspense fallback={null}>
              <SaleDetailNearbySales saleId={id} coords={saleCoords} className="w-full" />
            </Suspense>
          ) : null
        }
        nearbySalesDesktopSection={
          saleCoords ? (
            <Suspense fallback={null}>
              <SaleDetailNearbySales saleId={id} coords={saleCoords} />
            </Suspense>
          ) : null
        }
      />
    </div>
  )
}

export async function generateMetadata({ params }: SaleDetailPageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || []
  const isDebugAdmin = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEBUG === 'true'
  const isAdmin = !!(user?.email && adminEmails.includes(user.email.toLowerCase())) || isDebugAdmin
  const result = await getSaleWithItemsForRequest(id)
  
  if (!result || ((result.sale as any).moderation_status === 'hidden_by_admin' && !isAdmin)) {
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

  let seoEmissionAllowed = false
  let saleIndexEligible = isSaleLocallySeoEligible(result.sale)
  try {
    const emission = await getInventorySeoEmissionForRequest()
    seoEmissionAllowed = emission.seoEmissionAllowed
    if (saleIndexEligible) {
      const ingestedFlags = await loadIngestedEligibilityFlagsForPublishedSale(String(result.sale.id))
      saleIndexEligible = isSaleSeoIndexEligible({
        status: result.sale.status,
        archived_at: (result.sale as any).archived_at,
        moderation_status: (result.sale as any).moderation_status,
        ends_at: (result.sale as any).ends_at,
        external_source_url: (result.sale as any).external_source_url,
        lat: (result.sale as any).lat,
        lng: (result.sale as any).lng,
        ingestedIsDuplicate: ingestedFlags.ingestedIsDuplicate,
        ingestedSuperseded: ingestedFlags.ingestedSuperseded,
      })
    }
  } catch {
    seoEmissionAllowed = false
  }

  return createListingSeoMetadata(result.sale, {
    categories: displayCategories,
    robots: resolveListingIndexRobots(seoEmissionAllowed && saleIndexEligible),
  })
}
