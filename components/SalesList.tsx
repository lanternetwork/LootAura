import SaleCard from './SaleCard'
import EmptyState from './EmptyState'
import { Sale } from '@/lib/types'
import { MobileListInlineAd, ListInlineAd } from '@/components/ads/AdSlots'

interface SalesListProps {
  sales: Sale[]
  _mode?: string
  viewport?: { center: { lat: number; lng: number }; zoom: number } | null
}

export default function SalesList({ sales, _mode, viewport }: SalesListProps) {
  const isEmpty = !sales?.length

  if (isEmpty) {
    return (
      <EmptyState 
        title="No Sales Found" 
        cta={
          <a 
            href="/explore?tab=add" 
            className="link-accent font-medium"
          >
            Post the first sale →
          </a>
        } 
      />
    )
  }

  return (
    <div 
      className="flex flex-col gap-3 sm:gap-4 md:grid md:grid-cols-1 lg:grid-cols-2" 
      data-testid="sales-list" 
      style={{ width: '100%' }}
    >
      {sales.map((sale, index) => (
        <div key={sale.id}>
          <SaleCard sale={sale} viewport={viewport} />
          {/* Show inline ad after every 6th sale (indices 5, 11, 17, etc.) */}
          {/* Mobile: use MobileListInlineAd, Desktop: use ListInlineAd */}
          {(index + 1) % 6 === 0 && index > 0 && (
            <>
              <MobileListInlineAd />
              <div className="hidden md:block">
                <ListInlineAd />
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
