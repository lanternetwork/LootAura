'use client'

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
import { extractHandleFromUrl, SUPPORTED_SOCIAL_ORDER, type SocialLinks, type SocialProvider } from '@/lib/profile/social'

interface SocialLinksRowProps {
  socialLinks?: SocialLinks | null
}

const PROVIDER_ICONS = {
  twitter: Twitter,
  instagram: Instagram,
  facebook: Facebook,
  tiktok: Music2,
  youtube: Youtube,
  threads: AtSign,
  pinterest: Pin,
  linkedin: Linkedin,
  website: Globe,
} as const

const PROVIDER_LABELS: Record<keyof typeof PROVIDER_ICONS, string> = {
  twitter: 'Twitter/X',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  threads: 'Threads',
  pinterest: 'Pinterest',
  linkedin: 'LinkedIn',
  website: 'Website',
}

export function SocialLinksRow({ socialLinks }: SocialLinksRowProps) {
  if (!socialLinks || Object.keys(socialLinks).length === 0) {
    return null
  }

  // Filter to only configured (non-empty) links and iterate in display order
  const configuredLinks: Array<[SocialProvider, string]> = []
  for (const provider of SUPPORTED_SOCIAL_ORDER) {
    const url = socialLinks[provider]
    if (url && typeof url === 'string' && url.trim()) {
      configuredLinks.push([provider, url])
    }
  }

  if (configuredLinks.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-4 mt-4">
      {configuredLinks.map(([provider, url]) => {
        const Icon = PROVIDER_ICONS[provider]
        const label = PROVIDER_LABELS[provider] || provider
        const handle = extractHandleFromUrl(provider, url)

        if (!Icon || !url) return null

        return (
          <a
            key={provider}
            href={url}
            target="_blank"
            rel="me noopener noreferrer"
            className="inline-flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors group"
            aria-label={`Visit ${label} profile`}
          >
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-neutral-100 group-hover:bg-neutral-200 transition-colors">
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">{handle}</span>
          </a>
        )
      })}
    </div>
  )
}

