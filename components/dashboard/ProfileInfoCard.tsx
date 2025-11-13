'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'react-toastify'
import type { ProfileData } from '@/lib/data/profileAccess'

interface ProfileInfoCardProps {
  initialProfile: ProfileData | null
  onSaved?: (next: ProfileData) => void
}

export function ProfileInfoCard({ initialProfile, onSaved }: ProfileInfoCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Single state object to avoid focus loss
  const [formValues, setFormValues] = useState({
    display_name: initialProfile?.display_name || '',
    bio: initialProfile?.bio || '',
    city: initialProfile?.location_city || '',
    region: initialProfile?.location_region || '',
  })

  // Sync formValues when initialProfile changes (e.g., after save)
  useEffect(() => {
    if (!isEditing) {
      setFormValues({
        display_name: initialProfile?.display_name || '',
        bio: initialProfile?.bio || '',
        city: initialProfile?.location_city || '',
        region: initialProfile?.location_region || '',
      })
    }
  }, [initialProfile, isEditing])

  // Check if form has changes
  const hasChanges = 
    formValues.display_name.trim() !== (initialProfile?.display_name || '').trim() ||
    formValues.bio.trim() !== (initialProfile?.bio || '').trim() ||
    formValues.city.trim() !== (initialProfile?.location_city || '').trim() ||
    formValues.region.trim() !== (initialProfile?.location_region || '').trim()

  const handleFieldChange = useCallback((field: keyof typeof formValues, value: string) => {
    setFormValues(prev => ({
      ...prev,
      [field]: value,
    }))
  }, [])

  const handleCancel = useCallback(() => {
    setFormValues({
      display_name: initialProfile?.display_name || '',
      bio: initialProfile?.bio || '',
      city: initialProfile?.location_city || '',
      region: initialProfile?.location_region || '',
    })
    setIsEditing(false)
  }, [initialProfile])

  const handleSave = useCallback(async () => {
    if (!hasChanges || saving) return

    // Validate and trim
    const payload = {
      display_name: formValues.display_name.trim().slice(0, 80) || null,
      bio: formValues.bio.trim().slice(0, 250) || null,
      city: formValues.city.trim() || null,
      region: formValues.region.trim() || null,
    }

    setSaving(true)
    try {
      const response = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (result.ok) {
        toast.success('Profile updated successfully')
        setIsEditing(false)
        
        // Update local state with saved values
        setFormValues({
          display_name: payload.display_name || '',
          bio: payload.bio || '',
          city: payload.city || '',
          region: payload.region || '',
        })

        // Call onSaved callback if provided
        if (onSaved && result.data?.profile) {
          onSaved(result.data.profile)
        }
      } else {
        toast.error(result.error || 'Failed to update profile')
      }
    } catch (error) {
      console.error('[PROFILE_INFO] Save error:', error)
      toast.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }, [hasChanges, saving, formValues, onSaved])

  if (!initialProfile) {
    return (
      <div className="card">
        <div className="card-body-lg">
          <div className="text-neutral-600">Loading profile...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-body-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-title">Profile Information</h2>
          {!isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="btn-accent text-sm"
            >
              Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="btn-accent text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Display Name <span className="text-neutral-500">(max 80 characters)</span>
            </label>
            {isEditing ? (
              <input
                key="display_name"
                type="text"
                value={formValues.display_name}
                onChange={(e) => handleFieldChange('display_name', e.target.value)}
                maxLength={80}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Your display name"
              />
            ) : (
              <div className="text-neutral-900">
                {formValues.display_name || <span className="text-neutral-400">Not set</span>}
              </div>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Bio <span className="text-neutral-500">(max 250 characters)</span>
            </label>
            {isEditing ? (
              <textarea
                key="bio"
                value={formValues.bio}
                onChange={(e) => handleFieldChange('bio', e.target.value)}
                maxLength={250}
                rows={3}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                placeholder="Tell us about yourself"
              />
            ) : (
              <div className="text-neutral-900 whitespace-pre-wrap">
                {formValues.bio || <span className="text-neutral-400">Not set</span>}
              </div>
            )}
          </div>

          {/* City and Region */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                City
              </label>
              {isEditing ? (
                <input
                  key="city"
                  type="text"
                  value={formValues.city}
                  onChange={(e) => handleFieldChange('city', e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="City"
                />
              ) : (
                <div className="text-neutral-900">
                  {formValues.city || <span className="text-neutral-400">Not set</span>}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Region/State
              </label>
              {isEditing ? (
                <input
                  key="region"
                  type="text"
                  value={formValues.region}
                  onChange={(e) => handleFieldChange('region', e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="State or Region"
                />
              ) : (
                <div className="text-neutral-900">
                  {formValues.region || <span className="text-neutral-400">Not set</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

