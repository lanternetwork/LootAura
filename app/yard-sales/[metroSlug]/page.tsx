import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import MetroHelpfulContent from '@/components/metro/MetroHelpfulContent'
import MetroMapSection from '@/components/metro/MetroMapSection'
import MetroPageFaq from '@/components/metro/MetroPageFaq'
import MetroPageHero, { metroFreshnessLabel } from '@/components/metro/MetroPageHero'
import MetroPageMapCta from '@/components/metro/MetroPageMapCta'
import SeoSaleListItem from '@/components/seo/SeoSaleListItem'
import { createCityPageMetadata } from '@/lib/seo/metadata'
import { loadMetroPageContext } from '@/lib/seo/snapshots/loadMetroPageContext'
import {
  createCityPageStructuredDataBundle,
  saleToInventoryListItem,
} from '@/lib/seo/structuredData'
import { buildMetroGeoLinks } from '@/lib/seo/geoLinking'
import SeoGeoDiscoveryLinks from '@/components/seo/SeoGeoDiscoveryLinks'
import {
  buildCityPageEmptyInventoryMessage,
  buildCityPageH1,
  buildCityPageSupportingCopy,
} from '@/lib/seo/copy/cityPageCopy'
import {
  buildMetroFaqItems,
  buildMetroHelpfulContentParagraphs,
  buildMetroHeroHeadline,
  buildMetroHeroSubtitle,
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
    return { title: 'Yard sales · Loot Aura' }
  }
  const { metro, inventory, robots } = context
  return createCityPageMetadata({
    metro,
    inventory: inventory.summary,
    robots: robotsDirectiveToMetadata(robots),
  })
}

export default async function YardSalesMetroPage({ params }: PageProps) {
  const { metroSlug } = await params
  const context = await loadMetroPageContext(metroSlug)
  if (!context) {
    notFound()
  }

  const { metro, inventory, nearbyMetros, inventoryCount, radiusMiles, mapViewport } = context
  const { sales, summary } = inventory
  const allMetros = [metro, ...nearbyMetros]
  const geoLinks = buildMetroGeoLinks(metro, allMetros)
  const interactiveMapHref = `/sales?city=${encodeURIComponent(metro.city)}`
  const headline =
    inventoryCount === 0
      ? buildCityPageH1(metro, summary, 'This Weekend', { stableTitleWhenEmpty: true })
      : buildMetroHeroHeadline(metro)
  const heroSubtitle = buildMetroHeroSubtitle({
    activeListingCount: inventoryCount,
    radiusMiles,
    city: metro.city,
  })
  const supportingCopy =
    inventoryCount === 0
      ? buildCityPageEmptyInventoryMessage()
      : buildCityPageSupportingCopy({
          metro,
          inventory: summary,
          nearbyMetros,
        })
  const helpfulParagraphs =
    inventoryCount > 0
      ? buildMetroHelpfulContentParagraphs({
          metro,
          radiusMiles,
          interactiveMapHref,
        })
      : []
  const faqItems = buildMetroFaqItems({ metro, radiusMiles })
  const mapPins = salesToMetroMapPins(sales)
  const structuredData = createCityPageStructuredDataBundle({
    metro,
    inventory: summary,
    items: sales.slice(0, 50).map(saleToInventoryListItem),
    includeInventoryList: inventoryCount > 0,
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
          <Link href="/sales" className="text-purple-700 hover:text-purple-900">
            Interactive map
          </Link>
        </p>

        <div className="mt-4">
          <MetroPageHero
            headline={headline}
            subtitle={heroSubtitle}
            freshnessLabel={metroFreshnessLabel(summary.lastUpdatedAt, inventoryCount)}
            interactiveMapHref={interactiveMapHref}
          />
        </div>

        <SeoGeoDiscoveryLinks links={geoLinks} />

        {mapViewport && (
          <MetroMapSection pins={mapPins} viewport={mapViewport} heading={`${metro.city} yard sales map`} />
        )}

        <section className="mt-10" aria-labelledby="active-listings-heading">
          <h2 id="active-listings-heading" className="text-2xl font-bold text-gray-900">
            Active listings
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
                <SeoSaleListItem key={sale.id} sale={sale} />
              ))}
            </ul>
          )}
        </section>

        {inventoryCount > 0 && (
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
