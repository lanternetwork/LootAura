'use client'

type SellerActivityCardProps = {
  ownerProfile?: { created_at?: string | null; full_name?: string | null } | null
  ownerStats?: {
    total_sales?: number | null
    avg_rating?: number | null
    ratings_count?: number | null
    last_sale_at?: string | null
  } | null
}

export function SellerActivityCard({ ownerProfile, ownerStats }: SellerActivityCardProps) {
  const createdAt = ownerProfile?.created_at ? new Date(ownerProfile.created_at) : null
  const memberSince = createdAt
    ? createdAt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : 'Recently joined'

  const totalSales = ownerStats?.total_sales ?? 0
  const hasRatings = (ownerStats?.ratings_count ?? 0) > 0

  return (
    <div className="rounded-2xl bg-white border border-[#EFE9D8] shadow-sm p-4 space-y-3">
      <h3 className="text-sm font-semibold text-[#3A2268]">Seller activity</h3>
      <div className="flex items-center justify-between text-sm">
        <span className="text-[#5B4A83]">Member since</span>
        <span className="font-medium text-[#3A2268]">{memberSince}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-[#5B4A83]">Sales posted</span>
        <span className="font-medium text-[#3A2268]">{totalSales}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-[#5B4A83]">Rating</span>
        {hasRatings ? (
          <span className="font-medium text-[#3A2268]">⭐ {ownerStats?.avg_rating?.toFixed?.(1)}</span>
        ) : (
          <span className="text-xs text-[#8D7DB2]">Reviews coming soon</span>
        )}
      </div>
    </div>
  )
}

