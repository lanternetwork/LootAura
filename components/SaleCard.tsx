import Link from 'next/link'
import Image from 'next/image'
import SalePlaceholder from './placeholders/SalePlaceholder'
import FavoriteButton from './FavoriteButton'
import { Sale } from '@/lib/types'
import { getSaleCoverUrl } from '@/lib/images/cover'

interface SaleCardProps {
  sale: Sale
  className?: string
  viewport?: { center: { lat: number; lng: number }; zoom: number } | null
}

export default function SaleCard({ sale, className, viewport }: SaleCardProps) {
  if (!sale) return null
  const cover = getSaleCoverUrl(sale)
  
  // Build detail page URL with viewport params to restore view on back
  const detailUrl = viewport 
    ? `/sales/${sale.id}?lat=${viewport.center.lat}&lng=${viewport.center.lng}&zoom=${viewport.zoom}`
    : `/sales/${sale.id}`

  return (
    <article 
      className={`rounded-2xl overflow-hidden shadow-sm border bg-white ${className ?? ''}`} 
      data-testid="sale-card" 
      data-debug="sale-card" 
      data-sale-id={String(sale?.id || '')}
      data-card="sale"
      data-kind="sale-row"
    >
      <div className="relative bg-gray-100 aspect-[16/6.75] md:aspect-[4/2.25] overflow-hidden">
        {cover ? (
          <Image
            src={cover.url}
            alt={cover.alt}
            fill
            sizes="(min-width:1024px) 33vw, 100vw"
            className="object-cover transform-gpu scale-[1.3]"
            priority={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 p-6 md:p-8">
            <SalePlaceholder className="max-w-[100%] max-h-[100%] w-auto h-auto opacity-90 scale-[1.69]" />
          </div>
        )}
      </div>

      <div className="p-2 flex flex-col gap-1">
        <div className="flex justify-between items-start">
          <h3 className="text-base font-semibold line-clamp-1">{sale?.title || `Sale ${sale?.id}`}</h3>
          {sale?.id && <FavoriteButton saleId={sale.id} initial={false} />}
        </div>
        {sale?.description && <p className="text-xs text-neutral-600 line-clamp-1">{sale.description}</p>}
        <div className="text-sm text-neutral-700">
          {sale?.address && <div>{sale.address}</div>}
          {sale?.city && sale?.state && <div>{sale.city}, {sale.state}</div>}
        </div>
        {sale?.date_start && (
          <div className="text-xs text-neutral-600">
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
            className="text-amber-600 font-medium hover:text-amber-700 text-sm" 
            href={detailUrl}
          >
            View Details →
          </Link>
        )}
      </div>
    </article>
  )
}
