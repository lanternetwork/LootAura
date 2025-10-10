import Link from 'next/link'
import FavoriteButton from './FavoriteButton'
import { Sale } from '@/lib/types'

export default function SaleCard({ sale, authority }: { sale: Sale; authority?: 'MAP' | 'FILTERS' }) {
  console.log('[DOM] item mounts id=', sale?.id)
  const isMap = authority === 'MAP'

  // Never early-return null in MAP authority; render a minimal stub instead
  if (!sale && !isMap) return null

  return (
    <article 
      className="sale-row rounded-xl border p-4 bg-white flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow" 
      data-testid="sale-card" 
      data-debug={`auth:${authority}`} 
      data-sale-id={String(sale?.id || '')}
      data-kind="sale-row"
    >
      <div className="flex justify-between">
        <h3 className="text-xl font-semibold line-clamp-1">{sale?.title || (isMap ? `Sale ${sale?.id}` : '')}</h3>
        {sale?.id && <FavoriteButton saleId={sale.id} initial={false} />}
      </div>
      
      {/* Image preview removed: photos are not part of the Sale schema */}
      
      {sale?.description && <p className="text-sm text-neutral-600 line-clamp-2">{sale.description}</p>}
      <div className="text-sm text-neutral-700">
        {sale?.address && <div>{sale.address}</div>}
        {sale?.city && sale?.state && <div>{sale.city}, {sale.state}</div>}
        {isMap && (!sale?.address || !sale?.city) && (
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
