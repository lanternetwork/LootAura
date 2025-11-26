'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import type { SocialLinks } from '@/lib/profile/social'
import type { ProfileData } from '@/lib/data/profileAccess'
import ProfileInfoForm from './ProfileInfoForm'
import SocialLinksForm from './SocialLinksForm'

interface EditProfileClientProps {
  initialProfile: ProfileData
}

export default function EditProfileClient({ initialProfile }: EditProfileClientProps) {
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileData>(initialProfile)

  // Update local state when initialProfile changes (e.g., after save)
  useEffect(() => {
    setProfile(initialProfile)
  }, [initialProfile])

  const handleProfileSaved = useCallback((updatedProfile: ProfileData) => {
    setProfile(updatedProfile)
    toast.success('Profile updated successfully')
    // Navigate back to dashboard and force a refresh so updated data is visible immediately
    router.push('/dashboard')
    router.refresh()
  }, [router])

  const handleSocialLinksSaved = useCallback((updatedLinks: SocialLinks) => {
    setProfile(prev => ({ ...prev, social_links: updatedLinks }))
    toast.success('Social links updated successfully')
    // Navigate back to dashboard after a short delay to show the toast
    setTimeout(() => {
      router.push('/dashboard')
    }, 1000)
  }, [router])

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Edit Profile</h1>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="btn-secondary text-sm"
        >
          Back to Dashboard
        </button>
      </div>

      <div className="space-y-6">
        {/* Profile Information Form */}
        <ProfileInfoForm
          initialProfile={profile}
          onSaved={handleProfileSaved}
        />

        {/* Social Links Form */}
        <SocialLinksForm
          initialLinks={profile.social_links || null}
          onSaved={handleSocialLinksSaved}
        />
      </div>
    </div>
  )
}

