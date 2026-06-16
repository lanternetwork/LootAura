import { SellerActivityCard } from '@/components/sales/SellerActivityCard'
import { getUserRatingForSellerForRequest } from '@/lib/data/saleDetailSecondaryLoader'
import type { SaleWithOwnerInfo } from '@/lib/data'

type SaleDetailSellerActivityProps = {
  sale: SaleWithOwnerInfo
  viewerUserId: string | null
}

export default async function SaleDetailSellerActivity({
  sale,
  viewerUserId,
}: SaleDetailSellerActivityProps) {
  let currentUserRating: number | null = null

  if (sale.owner_id && viewerUserId && viewerUserId !== sale.owner_id) {
    currentUserRating = await getUserRatingForSellerForRequest({
      ownerId: sale.owner_id,
      viewerUserId,
    })
  }

  return (
    <SellerActivityCard
      ownerProfile={sale.owner_profile}
      ownerStats={sale.owner_stats}
      currentUserRating={currentUserRating}
      saleId={sale.id}
    />
  )
}
