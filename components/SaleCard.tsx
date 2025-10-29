import Link from 'next/link'
import Image from 'next/image'
import FavoriteButton from './FavoriteButton'
import { Sale } from '@/lib/types'
import { getSaleCoverUrl } from '@/lib/images/cover'
import { cn } from '@/lib/utils'

interface SaleCardProps {
  sale: Sale
  className?: string
}

export default function SaleCard({ sale, className }: SaleCardProps) {
  if (!sale) return null

  const cover = getSaleCoverUrl(sale)

  return (
    <article 
      className={cn(
        "rounded-2xl overflow-hidden shadow-sm border bg-white grid grid-rows-[2fr_3fr]",
        className
      )}
      data-testid="sale-card" 
      data-debug="sale-card" 
      data-sale-id={String(sale?.id || '')}
      data-card="sale"
      data-kind="sale-row"
    >
      {/* Image section - 40% of card height */}
      <div className="relative min-h-[120px]">
        {cover ? (
          <Image
            src={cover.url}
            alt={cover.alt}
            fill
            sizes="(min-width:1024px) 33vw, 100vw"
            className="object-cover"
            priority={false}
          />
        ) : (
          <div className="h-full w-full bg-gray-100 grid place-items-center text-gray-400">
            <svg width="44" height="44" viewBox="0 0 24 24" className="opacity-70">
              <path d="M12 3 2 12h3v9h6v-6h2v6h6v-9h3z" fill="currentColor"/>
            </svg>
          </div>
        )}
      </div>

      {/* Details section - 60% of card height */}
      <div className="p-4 flex flex-col gap-2">
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-semibold line-clamp-1">{sale?.title || `Sale ${sale?.id}`}</h3>
          {sale?.id && <FavoriteButton saleId={sale.id} initial={false} />}
        </div>
        
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
            className="text-amber-600 font-medium hover:text-amber-700 mt-auto" 
            href={`/sales/${sale.id}`}
          >
            View Details →
          </Link>
        )}
      </div>
    </article>
  )
}
