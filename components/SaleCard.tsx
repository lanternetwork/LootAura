import Link from 'next/link'
import Image from 'next/image'
import FavoriteButton from './FavoriteButton'
import { Sale } from '@/lib/types'
import { getSaleCoverUrl } from '@/lib/images/cover'

export default function SaleCard({ sale, className }: { sale: Sale; className?: string }) {
  if (!sale) return null
  const cover = getSaleCoverUrl(sale)

  return (
    <article 
      className={`rounded-2xl overflow-hidden shadow-sm border bg-white ${className ?? ''}`} 
      data-testid="sale-card" 
      data-debug="sale-card" 
      data-sale-id={String(sale?.id || '')}
      data-card="sale"
      data-kind="sale-row"
    >
      <div className="relative bg-gray-100 aspect-[16/9] md:aspect-[4/3] overflow-hidden">
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
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 p-6 md:p-8">
            <img
              src="/images/house-placeholder.svg"
              alt="Placeholder house"
              className="max-w-[70%] max-h-[70%] w-auto h-auto opacity-90"
            />
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-2">
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-semibold line-clamp-1">{sale?.title || `Sale ${sale?.id}`}</h3>
          {sale?.id && <FavoriteButton saleId={sale.id} initial={false} />}
        </div>
        {sale?.description && <p className="text-sm text-neutral-600 line-clamp-2">{sale.description}</p>}
        <div className="text-sm text-neutral-700">
          {sale?.address && <div>{sale.address}</div>}
          {sale?.city && sale?.state && <div>{sale.city}, {sale.state}</div>}
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
      </div>
    </article>
  )
}
