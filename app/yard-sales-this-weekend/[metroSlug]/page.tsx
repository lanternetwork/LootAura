import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import MetroHelpfulContent from '@/components/metro/MetroHelpfulContent'
import MetroMapSection from '@/components/metro/MetroMapSection'
import MetroPageFaq from '@/components/metro/MetroPageFaq'
import MetroPageHero from '@/components/metro/MetroPageHero'
import MetroPageMapCta from '@/components/metro/MetroPageMapCta'
import MetroPageStatsStrip from '@/components/metro/MetroPageStatsStrip'
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
  const headline =
    sales.length === 0 ? buildWeekendPageH1(metro, summary, weekend) : buildWeekendMetroHeroHeadline(metro)
  const tagline =
    sales.length > 0
      ? buildMetroHeroSubtitle({
          activeListingCount: sales.length,
          radiusMiles,
          city: metro.city,
          weekend: true,
        })
      : undefined
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

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <p className="text-sm text-gray-500">
          <Link href={cityPageHref} className="font-medium text-[#3A2268] hover:text-[#2f1a52]">
            All {metro.city} yard sales
          </Link>
          {' · '}
          <Link href="/sales" className="font-medium text-[#3A2268] hover:text-[#2f1a52]">
            Interactive map
          </Link>
        </p>

        <div className="mt-4">
          <MetroPageHero
            headline={headline}
            activeListingCount={sales.length}
            radiusMiles={radiusMiles}
            city={metro.city}
            weekend
            lastUpdatedAt={summary.lastUpdatedAt}
            interactiveMapHref={interactiveMapHref}
            tagline={tagline}
          />
        </div>

        <MetroPageStatsStrip
          activeListingCount={sales.length}
          radiusMiles={radiusMiles}
          lastUpdatedAt={summary.lastUpdatedAt}
          nearbyMetros={nearbyMetros}
        />

        <p className="mt-4 text-sm font-medium text-gray-700 sm:mt-5">{weekend.label}</p>
        <p className="mt-1 text-xs text-gray-500">Dates in {metro.timezone}</p>

        <SeoGeoDiscoveryLinks links={geoLinks} showPrimary={false} />

        {mapViewport && (
          <MetroMapSection
            pins={mapPins}
            viewport={mapViewport}
            heading={`${metro.city} weekend yard sales map`}
            listingCount={sales.length}
          />
        )}

        <section className="mt-8 lg:mt-10" aria-labelledby="weekend-listings-heading">
          <h2 id="weekend-listings-heading" className="text-xl font-bold text-gray-900 sm:text-2xl">
            This weekend listings
          </h2>
          {sales.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-gray-200 bg-white px-5 py-10 text-center text-gray-600 sm:mt-6 sm:px-6">
              {buildCityPageEmptyInventoryMessage()
                .split('\n\n')
                .map((paragraph) => (
                  <p key={paragraph} className="mt-2 first:mt-0">
                    {paragraph}
                  </p>
                ))}
            </div>
          ) : (
            <ul className="mt-5 grid grid-cols-1 gap-5 sm:mt-6 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
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
            <section className="mt-10 space-y-4 text-base leading-relaxed text-gray-700 lg:mt-12">
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
