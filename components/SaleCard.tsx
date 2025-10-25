import Link from 'next/link'
import FavoriteButton from './FavoriteButton'
import { Sale } from '@/lib/types'

export default function SaleCard({ sale }: { sale: Sale }) {
  if (!sale) return null

  return (
    <article 
      className="sale-row rounded-lg border p-3 bg-white flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow" 
      data-testid="sale-card" 
      data-debug="sale-card" 
      data-sale-id={String(sale?.id || '')}
      data-card="sale"
      data-kind="sale-row"
      style={{ minHeight: '160px' }}
    >
      <div className="flex justify-between items-start">
        <h3 className="text-lg font-semibold line-clamp-1">{sale?.title || `Sale ${sale?.id}`}</h3>
        {sale?.id && <FavoriteButton saleId={sale.id} initial={false} />}
      </div>
      
      
      {/* Image preview removed: photos are not part of the Sale schema */}
      
      {sale?.description && <p className="text-sm text-neutral-600 line-clamp-2">{sale.description}</p>}
      <div className="text-sm text-neutral-700">
        {sale?.address && <div>{sale.address}</div>}
        {sale?.city && sale?.state && <div>{sale.city}, {sale.state}</div>}
        {(!sale?.address || !sale?.city) && (
          <div className="text-neutral-500">id:{String(sale?.id)}{sale?.lat && sale?.lng ? ` @ ${sale.lat.toFixed?.(3)},${sale.lng.toFixed?.(3)}` : ''}</div>
        )}
      </div>
      {sale?.date_start && (
        <div className="text-sm text-neutral-600">
          {new Date(`${sale.date_start}T${sale.time_start}`).toLocaleString()}
        </div>
      )}
      {sale?.price && (
        <div className="text-sm font-medium text-amber-600">
          ${sale.price}
        </div>
      )}
      {sale?.id && (
        <Link 
          className="text-amber-600 font-medium hover:text-amber-700" 
          href={`/sales/${sale.id}`}
        >
          View Details →
        </Link>
      )}
    </article>
  )
}
