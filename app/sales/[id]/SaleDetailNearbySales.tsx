import { NearbySalesCard } from '@/components/sales/NearbySalesCard'
import { getNearestSalesForRequest } from '@/lib/data/saleDetailSecondaryLoader'
import type { NearestSalesCoords } from '@/lib/data/salesAccess'

type SaleDetailNearbySalesProps = {
  saleId: string
  coords: NearestSalesCoords
  className?: string
}

export default async function SaleDetailNearbySales({
  saleId,
  coords,
  className,
}: SaleDetailNearbySalesProps) {
  const nearbySalesForSeo = await getNearestSalesForRequest({
    saleId,
    lat: coords.lat,
    lng: coords.lng,
    limit: 6,
  })
  const nearbySales = nearbySalesForSeo.slice(0, 2)

  if (nearbySales.length === 0) {
    return null
  }

  return (
    <div className={className}>
      <NearbySalesCard nearbySales={nearbySales} />
    </div>
  )
}
