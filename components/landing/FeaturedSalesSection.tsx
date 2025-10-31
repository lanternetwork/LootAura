import Link from 'next/link'
import SaleCard from '@/components/SaleCard'
import { Sale } from '@/lib/types'

async function fetchFeaturedSales(): Promise<Sale[]> {
  try {
    // In Next.js App Router server components, we can use absolute URLs
    // For production, use NEXT_PUBLIC_SITE_URL; for local dev, use localhost
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const res = await fetch(`${baseUrl}/api/sales?limit=8`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.sales || []
  } catch {
    return []
  }
}

function PlaceholderSaleCard({ index }: { index: number }) {
  const placeholderSale: Sale = {
    id: `placeholder-${index}`,
    title: `Sample Yard Sale ${index + 1}`,
    description: 'Browse furniture, electronics, and household items at this weekend sale.',
    address: '123 Main St',
    city: 'Louisville',
    state: 'KY',
    zip_code: '40202',
    lat: 38.25,
    lng: -85.75,
    date_start: new Date().toISOString().split('T')[0],
    time_start: '09:00',
    status: 'published',
    owner_id: 'placeholder',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10 rounded-full bg-aura-gold text-aura-navy px-3 py-1 text-xs font-semibold">
        Sample listing
      </div>
      <SaleCard sale={placeholderSale} />
    </div>
  )
}

export async function FeaturedSalesSection() {
  const sales = await fetchFeaturedSales()
  const displaySales = sales.length > 0 ? sales.slice(0, 6) : []
  const placeholderCount = displaySales.length === 0 ? 6 : 0

  return (
    <section className="py-12 lg:py-16 bg-aura-cream">
      <div className="mx-auto max-w-6xl px-4 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-aura-navy">Featured sales near you</h2>
          <Link href="/sales" className="text-sm text-aura-navy/60 hover:text-aura-navy transition-colors">
            View all →
          </Link>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {displaySales.map((sale) => (
            <SaleCard key={sale.id} sale={sale} />
          ))}
          {placeholderCount > 0 && (
            Array.from({ length: placeholderCount }).map((_, i) => (
              <PlaceholderSaleCard key={`placeholder-${i}`} index={i} />
            ))
          )}
        </div>
      </div>
    </section>
  )
}

