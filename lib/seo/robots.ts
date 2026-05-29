import type { Metadata } from 'next'
import type { SeoRobotsDirective } from '@/lib/seo/types'

export function createSeoRobotsMetadata(directive: SeoRobotsDirective): Metadata['robots'] {
  return {
    index: directive.index,
    follow: directive.follow,
    'max-video-preview': -1,
    'max-image-preview': 'large',
    'max-snippet': -1,
  }
}

/** Phase 0 default: staging / pilot pages remain noindex until allowlist + crawl validation pass. */
export function createNoindexRobotsMetadata(): Metadata['robots'] {
  return createSeoRobotsMetadata({ index: false, follow: true })
}

export function createIndexableRobotsMetadata(): Metadata['robots'] {
  return createSeoRobotsMetadata({ index: true, follow: true })
}
