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

export async function FeaturedSalesSection() {
  const sales = await fetchFeaturedSales()

  return (
    <section className="py-12 lg:py-16 bg-aura-cream">
      <div className="mx-auto max-w-6xl px-4 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-aura-navy">Featured sales near you</h2>
          <Link href="/sales" className="text-sm text-aura-navy/60 hover:text-aura-navy transition-colors">
            View all →
          </Link>
        </div>
        {sales.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sales.slice(0, 6).map((sale) => (
              <SaleCard key={sale.id} sale={sale} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-aura-navy/60">
            <p>No sales found. Be the first to post one!</p>
            <Link href="/sell/new" className="inline-block mt-4 text-aura-gold hover:text-[#d39a2f] font-medium">
              Post a sale →
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

