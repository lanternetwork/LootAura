'use client'

import Link from 'next/link'
import Image from 'next/image'
import { SellerRatingStars } from '@/components/seller/SellerRatingStars'
import { useAuth } from '@/lib/hooks/useAuth'

type SellerActivityCardProps = {
  ownerProfile?: { 
    id?: string | null
    created_at?: string | null
    full_name?: string | null
    username?: string | null
    avatar_url?: string | null
  } | null
  ownerStats?: {
    total_sales?: number | null
    avg_rating?: number | null
    ratings_count?: number | null
    last_sale_at?: string | null
  } | null
  currentUserRating?: number | null
  saleId?: string | null
}

export function SellerActivityCard({ ownerProfile, ownerStats, currentUserRating, saleId }: SellerActivityCardProps) {
  const { data: currentUser } = useAuth()
  const createdAt = ownerProfile?.created_at ? new Date(ownerProfile.created_at) : null
  const memberSince = createdAt
    ? createdAt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : 'Recently joined'

  const totalSales = ownerStats?.total_sales ?? 0
  const hasRatings = (ownerStats?.ratings_count ?? 0) > 0
  const isSeller = currentUser?.id === ownerProfile?.id

  // Build profile link - prefer username, fallback to id
  const profileSlug = ownerProfile?.username || ownerProfile?.id || ''
  const profileLink = profileSlug ? `/u/${encodeURIComponent(profileSlug)}` : '#'
  const displayName = ownerProfile?.full_name || ownerProfile?.username || 'Seller'
  const avatarUrl = ownerProfile?.avatar_url

  return (
    <div className="rounded-2xl bg-white border border-[#EFE9D8] shadow-sm p-4 space-y-3">
      <h3 className="text-sm font-semibold text-[#3A2268]">Seller Details</h3>
      
      {/* Seller Profile Section */}
      {profileSlug && (
        <Link 
          href={profileLink}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors group"
        >
          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                fill
                className="object-cover"
                sizes="40px"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[var(--accent-primary)] text-white font-semibold text-sm">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-[#3A2268] group-hover:text-[var(--accent-primary)] transition-colors truncate">
              {displayName}
            </div>
            {ownerProfile?.username && (
              <div className="text-xs text-[#5B4A83] truncate">
                @{ownerProfile.username}
              </div>
            )}
          </div>
          <svg 
            className="w-4 h-4 text-[#5B4A83] group-hover:text-[var(--accent-primary)] transition-colors flex-shrink-0" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-[#5B4A83]">Member since</span>
        <span className="font-medium text-[#3A2268]">{memberSince}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-[#5B4A83]">Sales posted</span>
        <span className="font-medium text-[#3A2268]">{totalSales}</span>
      </div>
      {/* Rating Section */}
      {ownerProfile?.id && (
        <div className="space-y-2 pt-2 border-t border-gray-200">
          <div className="text-sm font-semibold text-[#3A2268]">Seller Rating</div>
          <SellerRatingStars
            sellerId={ownerProfile.id}
            saleId={saleId || null}
            currentUserRating={currentUserRating ?? null}
            avgRating={ownerStats?.avg_rating ?? null}
            ratingsCount={ownerStats?.ratings_count ?? 0}
            isSeller={isSeller}
          />
        </div>
      )}
    </div>
  )
}

