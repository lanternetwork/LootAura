'use client'

type IdentityCardProps = {
  displayName?: string | null
  username?: string | null
  avatarUrl?: string | null
  locationCity?: string | null
  locationRegion?: string | null
  createdAt?: string | null
  verified?: boolean | null
  isOwner?: boolean
  onAvatarChange?: () => void
  onViewPublic?: () => void
}

export function IdentityCard({
  displayName,
  username,
  avatarUrl,
  locationCity,
  locationRegion,
  createdAt,
  verified,
  isOwner = false,
  onAvatarChange,
  onViewPublic,
}: IdentityCardProps) {
  return (
    <div className="card">
      <div className="card-body-lg flex flex-col sm:flex-row items-start gap-4">
        <div className="relative flex-shrink-0">
          <div
            className="w-20 h-20 rounded-full bg-neutral-200"
            style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
            aria-label={displayName || username || 'User avatar'}
          />
          {isOwner && (
            <button
              type="button"
              onClick={onAvatarChange}
              className="absolute -bottom-1 -right-1 bg-white rounded-full p-1.5 shadow-sm border border-neutral-200 hover:bg-neutral-50"
              aria-label="Change avatar"
            >
              <svg className="w-4 h-4 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold truncate">{displayName || username || 'User'}</h1>
            {verified && <span className="badge-accent">Verified</span>}
          </div>
          {username && <div className="text-sm text-neutral-600 mb-1">@{username}</div>}
          {(locationCity || locationRegion) && (
            <div className="text-sm text-neutral-600 mb-1">
              {locationCity}
              {locationRegion && `, ${locationRegion}`}
            </div>
          )}
          {createdAt && (
            <div className="text-sm text-neutral-600">
              Member since {new Date(createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
            </div>
          )}
        </div>
        {isOwner && onViewPublic && (
          <div className="flex gap-2">
            <button type="button" onClick={onViewPublic} className="btn-accent text-sm">
              View Public Profile
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

