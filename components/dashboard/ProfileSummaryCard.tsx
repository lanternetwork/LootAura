'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ProfileData } from '@/lib/data/profileAccess'

interface ProfileSummaryCardProps {
  profile: ProfileData | null
  onEdit?: () => void
}

export function ProfileSummaryCard({ profile, onEdit }: ProfileSummaryCardProps) {
  const router = useRouter()

  if (!profile) {
    return (
      <div className="card">
        <div className="card-body-lg">
          <div className="text-neutral-600">Loading profile...</div>
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
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div
            className="w-20 h-20 rounded-full bg-neutral-200"
            style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
        </div>

        {/* Profile Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold truncate">{displayName}</h1>
            {profile.verified && <span className="badge-accent">Verified</span>}
          </div>
          {profile.username && <div className="text-sm text-neutral-600 mb-1">@{profile.username}</div>}
          {(profile.location_city || profile.location_region) && (
            <div className="text-sm text-neutral-600 mb-1">
              {profile.location_city}
              {profile.location_region && `, ${profile.location_region}`}
            </div>
          )}
          {memberSince && (
            <div className="text-sm text-neutral-600">
              Member since {memberSince}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Link
            href="/account/edit"
            className="btn-accent text-sm"
          >
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

