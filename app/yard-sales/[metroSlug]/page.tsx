import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import SeoSaleListItem from '@/components/seo/SeoSaleListItem'
import { getPilotMetroBySlug, SEO_PILOT_METROS } from '@/lib/seo/pilotMetros'
import { fetchMetroInventory } from '@/lib/seo/fetchMetroInventory'
import { createCityPageMetadata } from '@/lib/seo/metadata'
import { resolveMetroPageRobots } from '@/lib/seo/indexRollout'
import {
  createCityPageStructuredDataBundle,
  saleToInventoryListItem,
} from '@/lib/seo/structuredData'
import { buildMetroGeoLinks, getNearbyPilotMetros } from '@/lib/seo/geoLinking'
import SeoGeoDiscoveryLinks from '@/components/seo/SeoGeoDiscoveryLinks'
import {
  buildCityPageH1,
  buildCityPageSupportingCopy,
  formatFreshnessLabel,
} from '@/lib/seo/copy/cityPageCopy'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ metroSlug: string }>
}

export function generateStaticParams() {
  return SEO_PILOT_METROS.map((metro) => ({ metroSlug: metro.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { metroSlug } = await params
  const metro = getPilotMetroBySlug(metroSlug)
  if (!metro) {
    return { title: 'Yard sales · Loot Aura' }
  }
  const { summary } = await fetchMetroInventory(metro)
  return createCityPageMetadata({
    metro,
    inventory: summary,
    robots: resolveMetroPageRobots(metro.slug),
  })
}

export default async function YardSalesMetroPage({ params }: PageProps) {
  const { metroSlug } = await params
  const metro = getPilotMetroBySlug(metroSlug)
  if (!metro) {
    notFound()
  }

  const { sales, summary } = await fetchMetroInventory(metro)
  const geoLinks = buildMetroGeoLinks(metro)
  const h1 = buildCityPageH1(metro, summary)
  const supportingCopy = buildCityPageSupportingCopy({
    metro,
    inventory: summary,
    nearbyMetros: getNearbyPilotMetros(metro),
  })
  const structuredData = createCityPageStructuredDataBundle({
    metro,
    inventory: summary,
    items: sales.slice(0, 50).map(saleToInventoryListItem),
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {structuredData.map((block, index) => (
        <script
          key={`${String(block['@type'])}-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-sm text-gray-500">
          <Link href="/sales" className="text-purple-700 hover:text-purple-900">
            Interactive map
          </Link>
        </p>

        <h1 className="mt-4 text-2xl font-bold text-gray-900 sm:text-3xl">{h1}</h1>

        <p className="mt-2 text-sm font-medium text-emerald-800">{formatFreshnessLabel(summary.lastUpdatedAt)}</p>

        <SeoGeoDiscoveryLinks links={geoLinks} />

        <p className="mt-2">
          <Link
            href={`/sales?city=${encodeURIComponent(metro.city)}`}
            className="text-sm font-medium text-purple-700 hover:text-purple-900"
          >
            View on interactive map →
          </Link>
        </p>

        <section className="mt-8 rounded-lg border border-gray-200 bg-white px-4">
          <h2 className="sr-only">Active listings</h2>
          {sales.length === 0 ? (
            <p className="py-8 text-center text-gray-600">No active listings in this area right now.</p>
          ) : (
            <ul>
              {sales.map((sale) => (
                <SeoSaleListItem key={sale.id} sale={sale} />
              ))}
            </ul>
          )}
        </section>

        <section className="prose prose-sm mt-10 max-w-none text-gray-700">
          {supportingCopy.split('\n\n').map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
        </section>
      </main>
    </div>
  )
}
