'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'react-toastify'
import type { ProfileData } from '@/lib/data/profileAccess'
import { getCsrfHeaders } from '@/lib/csrf-client'

interface NotificationPreferencesFormProps {
  initialProfile: ProfileData
  onSaved?: (next: ProfileData) => void
}

export default function NotificationPreferencesForm({ initialProfile, onSaved }: NotificationPreferencesFormProps) {
  const [saving, setSaving] = useState(false)
  
  // Default to true if null/undefined (for older rows)
  const getDefaultValue = (value: boolean | null | undefined): boolean => {
    return value ?? true
  }
  
  // Single state object to avoid focus loss
  const [formValues, setFormValues] = useState({
    email_favorites_digest_enabled: getDefaultValue(initialProfile?.email_favorites_digest_enabled),
    email_seller_weekly_enabled: getDefaultValue(initialProfile?.email_seller_weekly_enabled),
  })

  // Sync formValues when initialProfile changes (e.g., after save)
  useEffect(() => {
    setFormValues({
      email_favorites_digest_enabled: getDefaultValue(initialProfile?.email_favorites_digest_enabled),
      email_seller_weekly_enabled: getDefaultValue(initialProfile?.email_seller_weekly_enabled),
    })
  }, [initialProfile])

  // Check if form has changes
  const hasChanges = 
    formValues.email_favorites_digest_enabled !== getDefaultValue(initialProfile?.email_favorites_digest_enabled) ||
    formValues.email_seller_weekly_enabled !== getDefaultValue(initialProfile?.email_seller_weekly_enabled)

  const handleToggleChange = useCallback((field: keyof typeof formValues, value: boolean) => {
    setFormValues(prev => ({
      ...prev,
      [field]: value,
    }))
  }, [])

  const handleSave = useCallback(async () => {
    if (!hasChanges || saving) return

    setSaving(true)
    try {
      const csrfHeaders = getCsrfHeaders()
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...csrfHeaders,
      }

      const response = await fetch('/api/profile/notifications', {
        method: 'PUT',
        headers: requestHeaders,
        credentials: 'include',
        body: JSON.stringify({
          email_favorites_digest_enabled: formValues.email_favorites_digest_enabled,
          email_seller_weekly_enabled: formValues.email_seller_weekly_enabled,
        }),
      })

      const result = await response.json()

      if (result.ok) {
        // Notify parent so it can toast and handle navigation
        if (onSaved && result.data) {
          const updatedProfile: ProfileData = {
            ...initialProfile,
            email_favorites_digest_enabled: result.data.email_favorites_digest_enabled,
            email_seller_weekly_enabled: result.data.email_seller_weekly_enabled,
          }
          onSaved(updatedProfile)
        } else {
          // Fallback toast if no parent handler is provided
          toast.success('Notification preferences updated successfully')
        }
      } else {
        toast.error(result.error || 'Failed to update notification preferences')
      }
    } catch (error) {
      console.error('[NOTIFICATION_PREFERENCES] Save error:', error)
      toast.error('Failed to update notification preferences')
    } finally {
      setSaving(false)
    }
  }, [hasChanges, saving, formValues, onSaved, initialProfile])

  return (
    <div className="card">
      <div className="card-body-lg">
        <h2 className="card-title mb-4">Email Notifications</h2>

        <div className="space-y-6">
          {/* Favorites Digest Toggle */}
          <div className="flex items-start justify-between">
            <div className="flex-1 pr-4">
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Favorites starting soon emails
              </label>
              <p className="text-sm text-neutral-500">
                Get an email when your favorite sales are about to start.
              </p>
            </div>
            <div className="flex-shrink-0">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formValues.email_favorites_digest_enabled}
                  onChange={(e) => handleToggleChange('email_favorites_digest_enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-neutral-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>
          </div>

          {/* Seller Weekly Toggle */}
          <div className="flex items-start justify-between">
            <div className="flex-1 pr-4">
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Seller weekly summary
              </label>
              <p className="text-sm text-neutral-500">
                Receive a weekly email with stats about your sales.
              </p>
            </div>
            <div className="flex-shrink-0">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formValues.email_seller_weekly_enabled}
                  onChange={(e) => handleToggleChange('email_seller_weekly_enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-neutral-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
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

