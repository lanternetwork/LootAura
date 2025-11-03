'use client'

type SellerSignalsProps = {
  avgRating?: number | null
  ratingsCount?: number | null
  salesFulfilled?: number | null
  memberSince?: string | null
}

export function SellerSignals({ avgRating, ratingsCount, salesFulfilled, memberSince }: SellerSignalsProps) {
  const year = memberSince ? new Date(memberSince).getFullYear() : null
  const hasRating = (ratingsCount ?? 0) > 0

  return (
    <div className="card">
      <div className="card-body-lg">
        <h2 className="card-title mb-4">Seller Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-semibold text-neutral-900 mb-1">
              {hasRating ? (
                <>
                  ⭐ {avgRating?.toFixed(1) ?? '5.0'}
                </>
              ) : (
                <span className="text-neutral-500">—</span>
              )}
            </div>
            <div className="text-sm text-neutral-600">Seller Rating</div>
            {hasRating && (
              <div className="text-xs text-neutral-500 mt-1">({ratingsCount} {ratingsCount === 1 ? 'review' : 'reviews'})</div>
            )}
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-neutral-900 mb-1">{salesFulfilled ?? 0}</div>
            <div className="text-sm text-neutral-600">Sales Fulfilled</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-neutral-900 mb-1">{year ?? '—'}</div>
            <div className="text-sm text-neutral-600">Member Since</div>
          </div>
        </div>
      </div>
    </div>
  )
}

