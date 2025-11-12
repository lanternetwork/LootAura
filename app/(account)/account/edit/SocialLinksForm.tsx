'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'react-toastify'
// These imports are used but ESLint doesn't recognize usage in typeof expressions and function calls
import { normalizeSocialLinks, SUPPORTED_PROVIDERS, type SocialLinks } from '@/lib/profile/social' // eslint-disable-line @typescript-eslint/no-unused-vars

interface SocialLinksFormProps {
  initialLinks: SocialLinks | null
  onSaved?: (next: SocialLinks) => void
}

const PROVIDER_CONFIG = {
  twitter: { label: 'Twitter/X', placeholder: '@handle or URL' },
  instagram: { label: 'Instagram', placeholder: '@handle' },
  facebook: { label: 'Facebook', placeholder: '@handle or URL' },
  tiktok: { label: 'TikTok', placeholder: '@handle' },
  youtube: { label: 'YouTube', placeholder: '@handle' },
  threads: { label: 'Threads', placeholder: '@handle' },
  pinterest: { label: 'Pinterest', placeholder: 'handle' },
  linkedin: { label: 'LinkedIn', placeholder: 'handle or URL' },
  website: { label: 'Website', placeholder: 'https://example.com' },
} as const

export default function SocialLinksForm({ initialLinks, onSaved }: SocialLinksFormProps) {
  // Single state object to avoid focus loss
  const [formValues, setFormValues] = useState<Partial<SocialLinks>>(initialLinks || {})
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Sync formValues when initialLinks changes (e.g., after save)
  useEffect(() => {
    setFormValues(initialLinks || {})
  }, [initialLinks])

  // Track changes by comparing normalized values
  useEffect(() => {
    const initialNormalized = normalizeSocialLinks(initialLinks || {})
    const currentNormalized = normalizeSocialLinks(formValues)
    const changed = JSON.stringify(initialNormalized) !== JSON.stringify(currentNormalized)
    setHasChanges(changed)
  }, [formValues, initialLinks])

  const handleFieldChange = useCallback((provider: typeof SUPPORTED_PROVIDERS[number], value: string) => {
    setFormValues(prev => ({
      ...prev,
      [provider]: value || undefined,
    }))
  }, [])

  const handleSave = useCallback(async () => {
    if (!hasChanges || saving) return

    setSaving(true)
    try {
      // Normalize before sending
      const normalized = normalizeSocialLinks(formValues)

      const response = await fetch('/api/profile/social-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: normalized }),
      })

      const result = await response.json()

      if (result.ok) {
        toast.success('Social links updated successfully')
        // Update local state with normalized values
        setFormValues(result.data?.social_links || normalized)
        setHasChanges(false)

        // Call onSaved callback if provided
        if (onSaved && result.data?.social_links) {
          onSaved(result.data.social_links)
        }
      } else {
        toast.error(result.error || 'Failed to update social links')
      }
    } catch (error) {
      console.error('[SOCIAL_LINKS_FORM] Save error:', error)
      toast.error('Failed to update social links')
    } finally {
      setSaving(false)
    }
  }, [hasChanges, saving, formValues, onSaved])

  // Extract display value from canonical URL for editing
  const getDisplayValue = useCallback((provider: typeof SUPPORTED_PROVIDERS[number], url?: string): string => {
    if (!url) return ''
    // If it's already a handle-like value (no http), return as-is
    if (!url.startsWith('http')) return url
    // Extract handle from URL
    const patterns: Record<typeof SUPPORTED_PROVIDERS[number], RegExp> = {
      twitter: new RegExp('twitter\\.com/([^/?]+)', 'i'),
      instagram: new RegExp('instagram\\.com/([^/?]+)', 'i'),
      facebook: new RegExp('facebook\\.com/([^/?]+)', 'i'),
      tiktok: new RegExp('tiktok\\.com/@?([^/?]+)', 'i'),
      youtube: new RegExp('youtube\\.com/@?([^/?]+)', 'i'),
      threads: new RegExp('threads\\.net/@?([^/?]+)', 'i'),
      pinterest: new RegExp('pinterest\\.com/([^/?]+)', 'i'),
      linkedin: new RegExp('linkedin\\.com/(in|company)/([^/?]+)', 'i'),
      website: /.*/,
    }
    const pattern = patterns[provider]
    const match = url.match(pattern)
    if (match && provider !== 'website') {
      return match[match.length - 1] // Get last capture group
    }
    return url // For website, show full URL
  }, [])

  return (
    <div className="card">
      <div className="card-body-lg">
        <h2 className="card-title mb-4">Social Links</h2>
        <p className="text-sm text-neutral-600 mb-4">
          These links appear on your public profile only if set.
        </p>

        <div className="space-y-3">
          {SUPPORTED_PROVIDERS.map((provider) => {
            const config = PROVIDER_CONFIG[provider]
            const currentValue = formValues[provider]
            const displayValue = getDisplayValue(provider, currentValue)

            return (
              <div key={provider} className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    {config.label}
                  </label>
                  <input
                    key={provider}
                    type="text"
                    value={displayValue}
                    onChange={(e) => handleFieldChange(provider, e.target.value)}
                    placeholder={config.placeholder}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>
            )
          })}
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

