'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'react-toastify'
import type { ProfileData } from '@/lib/data/profileAccess'
import { getCsrfHeaders } from '@/lib/csrf-client'

interface ProfileInfoFormProps {
  initialProfile: ProfileData
  onSaved?: (next: ProfileData) => void
}

export default function ProfileInfoForm({ initialProfile, onSaved }: ProfileInfoFormProps) {
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
    setFormValues({
      display_name: initialProfile?.display_name || '',
      bio: initialProfile?.bio || '',
      city: initialProfile?.location_city || '',
      region: initialProfile?.location_region || '',
    })
  }, [initialProfile])

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

  const handleSave = useCallback(async () => {
    if (!hasChanges || saving) return

    // Validate and trim
    const payload = {
      display_name: formValues.display_name.trim().slice(0, 80) || null,
      bio: formValues.bio.trim().slice(0, 250) || null,
      location_city: formValues.city.trim() || '',
      location_region: formValues.region.trim() || '',
    }

    setSaving(true)
    try {
      const csrfHeaders = getCsrfHeaders()
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...csrfHeaders,
      }

      const response = await fetch('/api/profile/update', {
        method: 'POST',
        headers: requestHeaders,
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (result.ok) {
        // Update local state with saved values
        setFormValues({
          display_name: payload.display_name || '',
          bio: payload.bio || '',
          city: payload.location_city || '',
          region: payload.location_region || '',
        })

        // Notify parent so it can toast and handle navigation
        if (onSaved && result.data?.profile) {
          onSaved(result.data.profile)
        } else {
          // Fallback toast if no parent handler is provided
          toast.success('Profile updated successfully')
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

  return (
    <div className="card">
      <div className="card-body-lg">
        <h2 className="card-title mb-4">Profile Information</h2>

        <div className="space-y-4">
          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Display Name <span className="text-neutral-500">(max 80 characters)</span>
            </label>
            <input
              key="display_name"
              type="text"
              value={formValues.display_name}
              onChange={(e) => handleFieldChange('display_name', e.target.value)}
              maxLength={80}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Your display name"
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Bio <span className="text-neutral-500">(max 250 characters)</span>
            </label>
            <textarea
              key="bio"
              value={formValues.bio}
              onChange={(e) => handleFieldChange('bio', e.target.value)}
              maxLength={250}
              rows={3}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              placeholder="Tell us about yourself"
            />
          </div>

          {/* City and Region */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                City
              </label>
              <input
                key="city"
                type="text"
                value={formValues.city}
                onChange={(e) => handleFieldChange('city', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="City"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Region/State
              </label>
              <input
                key="region"
                type="text"
                value={formValues.region}
                onChange={(e) => handleFieldChange('region', e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="State or Region"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

