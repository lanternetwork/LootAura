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
import type { SocialLinks } from '@/lib/profile/social'

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

  const entries = Object.entries(socialLinks).filter(([_, url]) => url && typeof url === 'string')

  if (entries.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mt-4">
      {entries.map(([provider, url]) => {
        const Icon = PROVIDER_ICONS[provider as keyof typeof PROVIDER_ICONS]
        const label = PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] || provider

        if (!Icon || !url) return null

        return (
          <a
            key={provider}
            href={url}
            target="_blank"
            rel="me noopener noreferrer"
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900 transition-colors"
            aria-label={`Visit ${label} profile`}
            title={label}
          >
            <Icon className="w-5 h-5" />
          </a>
        )
      })}
    </div>
  )
}

