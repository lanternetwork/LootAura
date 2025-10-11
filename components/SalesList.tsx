import SaleCard from './SaleCard'
import EmptyState from './EmptyState'
import { Sale } from '@/lib/types'

export default function SalesList({ sales, authority, mode }: { sales: Sale[]; authority?: 'MAP' | 'FILTERS'; mode?: string }) {
  const isMap = authority === 'MAP'
  const isEmpty = isMap ? sales.length === 0 : !sales?.length

  if (isEmpty && !isMap) {
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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-debug={`mode:${mode}|auth:${authority}|items:${sales.length}`}>
      {sales.map(sale => {
        console.log('[DOM] list item rendered id=', sale.id)
        return <SaleCard key={sale.id} sale={sale} />
      })}
    </div>
  )
}
