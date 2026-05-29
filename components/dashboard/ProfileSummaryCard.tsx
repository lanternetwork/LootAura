'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ProfileData } from '@/lib/data/profileAccess'

export type ProfileCardStatus = 'loading' | 'ready' | 'missing' | 'error'

interface ProfileSummaryCardProps {
  profile: ProfileData | null
  status: ProfileCardStatus
  onEdit?: () => void
  onRetry?: () => void
  errorMessage?: string | null
}

export function ProfileSummaryCard({
  profile,
  status,
  onEdit,
  onRetry,
  errorMessage,
}: ProfileSummaryCardProps) {
  const router = useRouter()

  if (status === 'loading') {
    return (
      <div className="card">
        <div className="card-body-lg flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-500" />
          <div className="text-neutral-600">Loading profile...</div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="card">
        <div className="card-body-lg">
          <p className="text-red-700 mb-3">
            {errorMessage || 'We could not load your profile. Please try again.'}
          </p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="btn-secondary text-sm">
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  if (status === 'missing' || !profile) {
    return (
      <div className="card">
        <div className="card-body-lg">
          <p className="text-neutral-700 mb-3">
            We could not finish setting up your profile. Please refresh or contact support if
            this continues.
          </p>
          <div className="flex flex-wrap gap-2">
            {onRetry && (
              <button type="button" onClick={onRetry} className="btn-accent text-sm">
                Try again
              </button>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-secondary text-sm"
            >
              Refresh page
            </button>
          </div>
        </div>
      </div>
    )
  }

  const avatarUrl = profile.avatar_url ? `${profile.avatar_url}?v=${Date.now()}` : null
  const displayName = profile.display_name || profile.username || 'User'
  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
    : null

  const handleViewPublic = () => {
    const slug = profile.username || profile.id
    if (slug) {
      router.push(`/u/${encodeURIComponent(slug)}`)
    }
  }

  return (
    <div className="card">
      <div className="card-body-lg flex flex-col sm:flex-row items-start gap-4">
        <div className="relative flex-shrink-0">
          <div
            className="w-20 h-20 rounded-full bg-neutral-200"
            style={
              avatarUrl
                ? {
                    backgroundImage: `url(${avatarUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined
            }
            aria-label={displayName}
          />
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="absolute -bottom-1 -right-1 bg-white rounded-full p-1.5 shadow-sm border border-neutral-200 hover:bg-neutral-50"
              aria-label="Change avatar"
            >
              <svg className="w-4 h-4 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold truncate">{displayName}</h1>
            {profile.verified && <span className="badge-accent">Verified</span>}
          </div>
          {profile.username && (
            <div className="text-sm text-neutral-600 mb-1">@{profile.username}</div>
          )}
          {(profile.location_city || profile.location_region) && (
            <div className="text-sm text-neutral-600 mb-1">
              {profile.location_city}
              {profile.location_region && `, ${profile.location_region}`}
            </div>
          )}
          {memberSince && (
            <div className="text-sm text-neutral-600">Member since {memberSince}</div>
          )}
        </div>

        <div className="flex gap-2">
          <Link href="/account/edit" className="btn-accent text-sm">
            Edit Profile
          </Link>
          <button
            type="button"
            onClick={handleViewPublic}
            disabled={!profile.username && !profile.id}
            className="btn-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title={!profile.username && !profile.id ? 'Profile ID required' : 'View your public profile'}
          >
            View Public Profile
          </button>
        </div>
      </div>
    </div>
  )
}
