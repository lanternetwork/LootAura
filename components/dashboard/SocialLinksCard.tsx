'use client'

import { useState, useEffect } from 'react'
import { 
  Twitter, 
  Instagram, 
  Facebook, 
  Music2, 
  Youtube, 
  AtSign, 
  Pin, 
  Linkedin, 
  Globe 
} from 'lucide-react'
import { normalizeSocialLinks, SUPPORTED_PROVIDERS, type SocialLinks } from '@/lib/profile/social'
import { toast } from 'react-toastify'
import { getCsrfHeaders } from '@/lib/csrf-client'

interface SocialLinksCardProps {
  initial?: SocialLinks | null
}

const PROVIDER_CONFIG = {
  twitter: { label: 'Twitter/X', icon: Twitter, placeholder: '@handle' },
  instagram: { label: 'Instagram', icon: Instagram, placeholder: '@handle' },
  facebook: { label: 'Facebook', icon: Facebook, placeholder: '@handle or URL' },
  tiktok: { label: 'TikTok', icon: Music2, placeholder: '@handle' },
  youtube: { label: 'YouTube', icon: Youtube, placeholder: '@handle' },
  threads: { label: 'Threads', icon: AtSign, placeholder: '@handle' },
  pinterest: { label: 'Pinterest', icon: Pin, placeholder: 'handle' },
  linkedin: { label: 'LinkedIn', icon: Linkedin, placeholder: 'handle or URL' },
  website: { label: 'Website', icon: Globe, placeholder: 'https://example.com' },
} as const

export default function SocialLinksCard({ initial }: SocialLinksCardProps) {
  const [links, setLinks] = useState<Partial<SocialLinks>>(initial || {})
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Track changes
  useEffect(() => {
    const initialNormalized = normalizeSocialLinks(initial || {})
    const currentNormalized = normalizeSocialLinks(links)
    const changed = JSON.stringify(initialNormalized) !== JSON.stringify(currentNormalized)
    setHasChanges(changed)
  }, [links, initial])

  const handleChange = (provider: typeof SUPPORTED_PROVIDERS[number], value: string) => {
    setLinks((prev) => ({
      ...prev,
      [provider]: value || undefined,
    }))
  }

  const handleSave = async () => {
    if (!hasChanges) return

    setSaving(true)
    try {
      // Normalize before sending
      const normalized = normalizeSocialLinks(links)

      const response = await fetch('/api/profile/social-links', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getCsrfHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ links: normalized }),
      })

      const result = await response.json()

      if (result.ok) {
        toast.success('Social links updated successfully')
        // Update local state with normalized values
        setLinks(result.data?.social_links || normalized)
        setHasChanges(false)
      } else {
        toast.error(result.error || 'Failed to update social links')
      }
    } catch (error) {
      console.error('[SOCIAL_LINKS] Save error:', error)
      toast.error('Failed to update social links')
    } finally {
      setSaving(false)
    }
  }

  // Extract handle/URL from canonical URL for display
  const getDisplayValue = (provider: typeof SUPPORTED_PROVIDERS[number], url?: string): string => {
    if (!url) return ''
    // If it's already a handle-like value (no http), return as-is
    if (!url.startsWith('http')) return url
    // Extract handle from URL
    const patterns: Record<typeof provider, RegExp> = {
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
  }

  return (
    <div className="card">
      <div className="card-body-lg">
        <h2 className="card-title mb-4">Social Links</h2>
        <p className="text-sm text-neutral-600 mb-4">
          Add your social media profiles and website. Links will appear on your public profile.
        </p>

        <div className="space-y-3">
          {SUPPORTED_PROVIDERS.map((provider) => {
            const config = PROVIDER_CONFIG[provider]
            const Icon = config.icon
            const currentValue = links[provider]
            const displayValue = getDisplayValue(provider, currentValue)

            return (
              <div key={provider} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-neutral-500">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    {config.label}
                  </label>
                  <input
                    type="text"
                    value={displayValue}
                    onChange={(e) => handleChange(provider, e.target.value)}
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

