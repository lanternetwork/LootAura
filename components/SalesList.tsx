import SaleCard from './SaleCard'
import EmptyState from './EmptyState'
import { Sale } from '@/lib/types'
import { MobileListInlineAd } from '@/components/ads/AdSlots'

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
          {/* Show mobile inline ad after 6th item (index 5) and optionally after 12th item (index 11) */}
          {(index === 5 || (index === 11 && sales.length > 12)) && <MobileListInlineAd />}
        </div>
      ))}
    </div>
  )
}
