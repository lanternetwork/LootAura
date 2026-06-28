import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import MetroHelpfulContent from '@/components/metro/MetroHelpfulContent'
import MetroMapSection from '@/components/metro/MetroMapSection'
import MetroPageFaq from '@/components/metro/MetroPageFaq'
import MetroPageHero, { metroFreshnessLabel } from '@/components/metro/MetroPageHero'
import MetroPageMapCta from '@/components/metro/MetroPageMapCta'
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
import { buildCityPageEmptyInventoryMessage } from '@/lib/seo/copy/cityPageCopy'
import {
  buildMetroFaqItems,
  buildMetroHeroSubtitle,
  buildWeekendMetroHelpfulContentParagraphs,
  buildWeekendMetroHeroHeadline,
} from '@/lib/seo/copy/metroPageCopy'
import { salesToMetroMapPins } from '@/lib/seo/metroMapViewport'

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

  const { metro, inventory, nearbyMetros, radiusMiles, mapViewport } = context
  const { sales, summary, weekend, freshnessBySaleId } = buildMetroWeekendInventoryFromResult(
    metro,
    inventory
  )
  const allMetros = [metro, ...nearbyMetros]
  const geoLinks = buildMetroGeoLinks(metro, allMetros)
  const interactiveMapHref = `/sales?city=${encodeURIComponent(metro.city)}`
  const cityPageHref = getCityPagePath(metro.slug)
  const headline = sales.length === 0 ? buildWeekendPageH1(metro, summary, weekend) : buildWeekendMetroHeroHeadline(metro)
  const heroSubtitle = buildMetroHeroSubtitle({
    activeListingCount: sales.length,
    radiusMiles,
    city: metro.city,
    weekend: true,
  })
  const supportingCopy = buildWeekendPageSupportingCopy({ metro, inventory: summary, weekend })
  const helpfulParagraphs =
    sales.length > 0
      ? buildWeekendMetroHelpfulContentParagraphs({
          metro,
          radiusMiles,
          weekendLabel: weekend.label,
          cityPageHref,
        })
      : []
  const faqItems = buildMetroFaqItems({ metro, radiusMiles })
  const mapPins = salesToMetroMapPins(sales)
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

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm text-gray-500">
          <Link href={cityPageHref} className="text-purple-700 hover:text-purple-900">
            All {metro.city} yard sales
          </Link>
          {' · '}
          <Link href="/sales" className="text-purple-700 hover:text-purple-900">
            Interactive map
          </Link>
        </p>

        <div className="mt-4">
          <MetroPageHero
            headline={headline}
            subtitle={heroSubtitle}
            freshnessLabel={metroFreshnessLabel(summary.lastUpdatedAt, sales.length)}
            interactiveMapHref={interactiveMapHref}
          />
        </div>

        <p className="mt-3 text-sm text-gray-600">{weekend.label}</p>
        <p className="mt-1 text-xs text-gray-500">Dates in {metro.timezone}</p>

        <SeoGeoDiscoveryLinks links={geoLinks} showPrimary={false} />

        {mapViewport && (
          <MetroMapSection
            pins={mapPins}
            viewport={mapViewport}
            heading={`${metro.city} weekend yard sales map`}
          />
        )}

        <section className="mt-10" aria-labelledby="weekend-listings-heading">
          <h2 id="weekend-listings-heading" className="text-2xl font-bold text-gray-900">
            This weekend listings
          </h2>
          {sales.length === 0 ? (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white px-6 py-10 text-center text-gray-600">
              {buildCityPageEmptyInventoryMessage()
                .split('\n\n')
                .map((paragraph) => (
                  <p key={paragraph} className="mt-2 first:mt-0">
                    {paragraph}
                  </p>
                ))}
            </div>
          ) : (
            <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
          <>
            <MetroPageMapCta href={interactiveMapHref} />
            <MetroHelpfulContent paragraphs={helpfulParagraphs} interactiveMapHref={interactiveMapHref} />
            <section className="prose prose-sm mt-10 max-w-none text-gray-700">
              {supportingCopy.split('\n\n').map((paragraph) => (
                <p key={paragraph.slice(0, 48)}>{paragraph}</p>
              ))}
            </section>
          </>
        )}

        <MetroPageFaq items={faqItems} />
      </main>
    </div>
  )
}
