import SaleCard from './SaleCard'
import EmptyState from './EmptyState'
import { Sale } from '@/lib/types'

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
      className="flex flex-col gap-3 sm:gap-4 md:grid md:grid-cols-2 lg:grid-cols-3" 
      data-testid="sales-list" 
      style={{ width: '100%' }}
    >
      {sales.map(sale => (
        <SaleCard key={sale.id} sale={sale} viewport={viewport} />
      ))}
    </div>
  )
}
