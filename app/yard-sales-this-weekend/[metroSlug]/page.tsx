import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import SeoSaleListItem from '@/components/seo/SeoSaleListItem'
import { buildMetroWeekendInventoryFromResult } from '@/lib/seo/buildMetroWeekendInventory'
import { formatFreshnessSignalLabel } from '@/lib/seo/fetchMetroWeekendInventory'
import { createWeekendPageMetadata } from '@/lib/seo/metadata'
import { loadMetroPageContext } from '@/lib/seo/snapshots/loadMetroPageContext'
import {
  createWeekendPageStructuredDataBundle,
  saleToInventoryListItem,
} from '@/lib/seo/structuredData'
import { getCityPagePath } from '@/lib/seo/canonical'
import { buildMetroGeoLinks } from '@/lib/seo/geoLinking'
import SeoGeoDiscoveryLinks from '@/components/seo/SeoGeoDiscoveryLinks'
import {
  buildWeekendPageH1,
  buildWeekendPageSupportingCopy,
} from '@/lib/seo/copy/weekendPageCopy'
import { buildCityPageEmptyInventoryMessage, formatFreshnessLabel } from '@/lib/seo/copy/cityPageCopy'

export const revalidate = 3600
export const dynamicParams = true

type PageProps = {
  params: Promise<{ metroSlug: string }>
}

function robotsDirectiveToMetadata(robots: 'index,follow' | 'noindex,follow') {
  return { index: robots === 'index,follow', follow: true as const }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { metroSlug } = await params
  const context = await loadMetroPageContext(metroSlug)
  if (!context) {
    return { title: 'Yard sales this weekend · Loot Aura' }
  }
  const { metro, inventory, robots } = context
  const { summary, weekend } = buildMetroWeekendInventoryFromResult(metro, inventory)
  return createWeekendPageMetadata({
    metro,
    inventory: summary,
    weekendLabel: weekend.label,
    robots: robotsDirectiveToMetadata(robots),
  })
}

export default async function YardSalesThisWeekendMetroPage({ params }: PageProps) {
  const { metroSlug } = await params
  const context = await loadMetroPageContext(metroSlug)
  if (!context) {
    notFound()
  }

  const { metro, inventory, nearbyMetros } = context
  const { sales, summary, weekend, freshnessBySaleId } = buildMetroWeekendInventoryFromResult(
    metro,
    inventory
  )
  const allMetros = [metro, ...nearbyMetros]
  const geoLinks = buildMetroGeoLinks(metro, allMetros)
  const h1 = buildWeekendPageH1(metro, summary, weekend)
  const supportingCopy = buildWeekendPageSupportingCopy({ metro, inventory: summary, weekend })
  const structuredData = createWeekendPageStructuredDataBundle({
    metro,
    inventory: summary,
    items: sales.slice(0, 50).map(saleToInventoryListItem),
    weekendLabel: weekend.label,
    includeInventoryList: sales.length > 0,
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
          <Link href={getCityPagePath(metro.slug)} className="text-purple-700 hover:text-purple-900">
            All {metro.city} yard sales
          </Link>
          {' · '}
          <Link href="/sales" className="text-purple-700 hover:text-purple-900">
            Interactive map
          </Link>
        </p>

        <h1 className="mt-4 text-2xl font-bold text-gray-900 sm:text-3xl">{h1}</h1>

        <p className="mt-2 text-sm text-gray-600">{weekend.label}</p>
        <p className="mt-1 text-xs text-gray-500">Dates in {metro.timezone}</p>

        {sales.length > 0 && (
          <p className="mt-2 text-sm font-medium text-emerald-800">
            {formatFreshnessLabel(summary.lastUpdatedAt)}
          </p>
        )}

        <SeoGeoDiscoveryLinks links={geoLinks} showPrimary={false} />

        <section className="mt-8 rounded-lg border border-gray-200 bg-white px-4">
          <h2 className="sr-only">This weekend listings</h2>
          {sales.length === 0 ? (
            <div className="py-8 text-center text-gray-600">
              {buildCityPageEmptyInventoryMessage()
                .split('\n\n')
                .map((paragraph) => (
                  <p key={paragraph} className="mt-2 first:mt-0">
                    {paragraph}
                  </p>
                ))}
            </div>
          ) : (
            <ul>
              {sales.map((sale) => (
                <SeoSaleListItem
                  key={sale.id}
                  sale={sale}
                  badges={(freshnessBySaleId[sale.id] ?? []).map(formatFreshnessSignalLabel)}
                />
              ))}
            </ul>
          )}
        </section>

        {sales.length > 0 && (
          <section className="prose prose-sm mt-10 max-w-none text-gray-700">
            {supportingCopy.split('\n\n').map((paragraph) => (
              <p key={paragraph.slice(0, 48)}>{paragraph}</p>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
