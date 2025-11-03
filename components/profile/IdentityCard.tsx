'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import Link from 'next/link'

type IdentityCardProps = {
  profile: {
    displayName?: string | null
    username?: string | null
    avatarUrl?: string | null
    locationCity?: string | null
    locationRegion?: string | null
    createdAt?: string | null
    verified?: boolean | null
  }
  mode: 'public' | 'owner'
  onAvatarChange?: () => void
  onViewPublic?: () => void
}

export function IdentityCard({ profile, mode, onAvatarChange, onViewPublic }: IdentityCardProps) {
  const { data: currentUser } = useAuth()
  const [copied, setCopied] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)

  const handleCopyLink = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Failed to copy link:', e)
    }
  }

  const handleReport = () => {
    setShowReportDialog(true)
  }

  const handleReportSubmit = () => {
    // Stub: TODO implement report API
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[PROFILE] report submitted', { username: profile.username })
    }
    setShowReportDialog(false)
    alert('Report submitted. Thank you for your feedback.')
  }

  return (
    <>
      <div className="card">
        <div className="card-body-lg flex flex-col sm:flex-row items-start gap-4">
          <div className="relative flex-shrink-0">
            <div
              className="w-20 h-20 rounded-full bg-neutral-200"
              style={profile.avatarUrl ? { backgroundImage: `url(${profile.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
              aria-label={profile.displayName || profile.username || 'User avatar'}
            />
            {mode === 'owner' && onAvatarChange && (
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
              <h1 className="text-xl font-semibold truncate">{profile.displayName || profile.username || 'User'}</h1>
              {profile.verified && <span className="badge-accent">Verified</span>}
            </div>
            {profile.username && <div className="text-sm text-neutral-600 mb-1">@{profile.username}</div>}
            {(profile.locationCity || profile.locationRegion) && (
              <div className="text-sm text-neutral-600 mb-1">
                {profile.locationCity}
                {profile.locationRegion && `, ${profile.locationRegion}`}
              </div>
            )}
            {profile.createdAt && (
              <div className="text-sm text-neutral-600">
                Member since {new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
              </div>
            )}
          </div>
          {mode === 'public' && (
            <div className="hidden sm:flex gap-2 flex-wrap">
              {currentUser ? (
                <Link href={`/messages?to=${profile.username}`} className="btn-accent text-sm">
                  Message Seller
                </Link>
              ) : (
                <Link href={`/auth/signin?redirectTo=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')}`} className="btn-accent text-sm">
                  Message Seller
                </Link>
              )}
              <button
                type="button"
                onClick={handleCopyLink}
                className="rounded px-4 py-2 border text-sm hover:bg-neutral-50"
              >
                {copied ? '✓ Copied!' : 'Copy Link'}
              </button>
              <button
                type="button"
                onClick={handleReport}
                className="rounded px-4 py-2 border text-sm hover:bg-neutral-50"
              >
                Report
              </button>
            </div>
          )}
          {mode === 'owner' && onViewPublic && (
            <div className="flex gap-2">
              <button type="button" onClick={onViewPublic} className="btn-accent text-sm">
                View Public Profile
              </button>
            </div>
          )}
        </div>
        {mode === 'public' && (
          <div className="sm:hidden flex gap-2 mt-4 px-6 pb-6">
            {currentUser ? (
              <Link href={`/messages?to=${profile.username}`} className="btn-accent text-sm flex-1 text-center">
                Message Seller
              </Link>
            ) : (
              <Link href={`/auth/signin?redirectTo=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')}`} className="btn-accent text-sm flex-1 text-center">
                Message Seller
              </Link>
            )}
            <button
              type="button"
              onClick={handleCopyLink}
              className="rounded px-4 py-2 border text-sm hover:bg-neutral-50"
            >
              {copied ? '✓' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={handleReport}
              className="rounded px-4 py-2 border text-sm hover:bg-neutral-50"
            >
              Report
            </button>
          </div>
        )}
      </div>

      {showReportDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowReportDialog(false)}>
          <div className="bg-white rounded-lg p-6 w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium mb-4">Report User</h3>
            <p className="text-sm text-neutral-600 mb-4">
              If you believe this user is violating our terms of service, please report them.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReportDialog(false)}
                className="rounded px-4 py-2 border text-sm hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReportSubmit}
                className="btn-accent text-sm"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
