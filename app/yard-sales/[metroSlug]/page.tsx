import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import SeoSaleListItem from '@/components/seo/SeoSaleListItem'
import { getPilotMetroBySlug, SEO_PILOT_METROS } from '@/lib/seo/pilotMetros'
import { fetchMetroInventory } from '@/lib/seo/fetchMetroInventory'
import { createCityPageMetadata } from '@/lib/seo/metadata'
import {
  createCityPageStructuredDataBundle,
  saleToInventoryListItem,
} from '@/lib/seo/structuredData'
import { getCityPagePath, getWeekendPagePath } from '@/lib/seo/canonical'
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
    robots: { index: false, follow: true },
  })
}

export default async function YardSalesMetroPage({ params }: PageProps) {
  const { metroSlug } = await params
  const metro = getPilotMetroBySlug(metroSlug)
  if (!metro) {
    notFound()
  }

  const { sales, summary } = await fetchMetroInventory(metro)
  const nearbyMetros = SEO_PILOT_METROS.filter(
    (m) => m.slug !== metro.slug && m.state === metro.state
  ).slice(0, 4)
  const h1 = buildCityPageH1(metro, summary)
  const supportingCopy = buildCityPageSupportingCopy({
    metro,
    inventory: summary,
    nearbyMetros,
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

        <p className="mt-4 flex flex-wrap gap-4">
          <Link
            href={getWeekendPagePath(metro.slug)}
            className="text-sm font-medium text-purple-700 hover:text-purple-900"
          >
            Yard sales this weekend →
          </Link>
          <Link
            href={`/sales?city=${encodeURIComponent(metro.city)}`}
            className="text-sm font-medium text-purple-700 hover:text-purple-900"
          >
            View on interactive map →
          </Link>
        </p>

        {nearbyMetros.length > 0 && (
          <nav className="mt-4" aria-label="Nearby metros">
            <p className="text-sm font-medium text-gray-700">Nearby areas</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {nearbyMetros.map((m) => (
                <li key={m.slug}>
                  <Link
                    href={getCityPagePath(m.slug)}
                    className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-800 hover:border-purple-400"
                  >
                    {m.city}, {m.state}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

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
