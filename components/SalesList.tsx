import SaleCard from './SaleCard'
import EmptyState from './EmptyState'
import { Sale } from '@/lib/types'

interface SalesListProps {
  sales: Sale[]
  mode?: string
  viewport?: { center: { lat: number; lng: number }; zoom: number } | null
}

export default function SalesList({ sales, mode, viewport }: SalesListProps) {
  const isEmpty = !sales?.length

  if (isEmpty) {
    return (
      <EmptyState 
        title="No Sales Found" 
        cta={
          <a 
            href="/explore?tab=add" 
            className="text-amber-600 hover:text-amber-700 font-medium"
          >
            Post the first sale →
          </a>
        } 
      />
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2" data-testid="sales-list" data-debug={`mode:${mode}|items:${sales.length}`}>
      {sales.map(sale => (
        <SaleCard key={sale.id} sale={sale} viewport={viewport} />
      ))}
    </div>
  )
}
