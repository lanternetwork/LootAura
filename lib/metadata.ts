import { Metadata } from 'next'
import { Sale } from '@/lib/types'
import { getSaleCoverUrl } from '@/lib/images/cover'

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.app').replace(/\/$/, '')
const siteName = 'Loot Aura'
const description = 'Discover local yard sales, garage sales, and estate sales in your area. Never miss a great deal again!'

export function createPageMetadata({
  title,
  description: pageDescription,
  path = '',
  image,
  type = 'website'
}: {
  title: string
  description?: string
  path?: string
  image?: string
  type?: 'website' | 'article'
}): Metadata {
  const fullTitle = `${title} | ${siteName}`
  const fullDescription = pageDescription || description
  const url = `${baseUrl}${path}`
  const imageUrl = image ? (image.startsWith('http') ? image : `${baseUrl}${image}`) : `${baseUrl}/og-image.jpg`

  return {
    title: fullTitle,
    description: fullDescription,
    openGraph: {
      title: fullTitle,
      description: fullDescription,
      url,
      siteName,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      type,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: fullDescription,
      images: [imageUrl],
    },
    alternates: {
      canonical: url,
    },
    robots: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  }
}

export function createSaleMetadata(sale: Sale): Metadata {
  const title = sale.title || 'Yard Sale'
  
  // Build description with location and date info
  const locationParts: string[] = []
  if (sale.city && sale.state) {
    locationParts.push(`${sale.city}, ${sale.state}`)
  } else if (sale.city) {
    locationParts.push(sale.city)
  } else if (sale.state) {
    locationParts.push(sale.state)
  }
  
  const dateParts: string[] = []
  if (sale.date_start) {
    const startDate = new Date(sale.date_start)
    if (sale.date_end && sale.date_end !== sale.date_start) {
      const endDate = new Date(sale.date_end)
      dateParts.push(`${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
    } else {
      dateParts.push(startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    }
  }
  
  let description = sale.description
  if (!description) {
    const parts: string[] = []
    if (sale.address) {
      parts.push(sale.address)
    }
    if (locationParts.length > 0) {
      parts.push(`Yard sale in ${locationParts.join(', ')}`)
    } else {
      parts.push('Yard sale')
    }
    if (dateParts.length > 0) {
      parts.push(`— ${dateParts.join(', ')}`)
    }
    description = parts.join(' ')
  }
  
  // Get cover image
  const cover = getSaleCoverUrl(sale)
  const image = cover?.url || `${baseUrl}/og-sale.jpg`
  
  // Build canonical URL (without UTM params)
  const path = `/sales/${sale.id}`
  const canonicalUrl = `${baseUrl}${path}`

  // Truncate title for metadata (max 60 chars)
  const metaTitle = title.length > 60 ? title.substring(0, 57) + '...' : title

  return {
    title: `${metaTitle} | ${siteName}`,
    description,
    metadataBase: new URL(baseUrl),
    openGraph: {
      type: 'website',
      title: metaTitle,
      description,
      url: canonicalUrl,
      siteName,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: metaTitle,
      description,
      images: [image],
    },
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  }
}

export function createExploreMetadata(): Metadata {
  return createPageMetadata({
    title: 'Explore Yard Sales',
    description: 'Browse and discover yard sales, garage sales, and estate sales in your area. Use our map view to find sales near you.',
    path: '/explore'
  })
}

export function createMapMetadata(): Metadata {
  return createPageMetadata({
    title: 'Map View',
    description: 'View yard sales on an interactive map. Find sales near your location and get directions.',
    path: '/explore?tab=map'
  })
}

export function createAddSaleMetadata(): Metadata {
  return createPageMetadata({
    title: 'Post Your Sale',
    description: 'List your yard sale, garage sale, or estate sale for free. Reach more customers in your area.',
    path: '/explore?tab=add'
  })
}

export function createSignInMetadata(): Metadata {
  return createPageMetadata({
    title: 'Sign In',
    description: 'Sign in to your Loot Aura account to save favorites and manage your sales.',
    path: '/signin'
  })
}

export function createFavoritesMetadata(): Metadata {
  return createPageMetadata({
    title: 'My Favorites',
    description: 'View and manage your favorite yard sales. Never miss a sale you\'re interested in.',
    path: '/favorites'
  })
}

export function createProfileMetadata(profile: {
  displayName?: string | null
  username?: string | null
  bio?: string | null
  avatarUrl?: string | null
}): Metadata {
  const title = profile.displayName || profile.username || 'Profile'
  const description = profile.bio || `View ${title}'s profile on Loot Aura`
  const image = profile.avatarUrl || undefined
  
  return createPageMetadata({
    title,
    description,
    path: `/u/${profile.username}`,
    image,
    type: 'website',
  })
}

// JSON-LD structured data for the homepage
export function createHomepageStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    description,
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${baseUrl}/explore?q={search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    },
    publisher: {
      '@type': 'Organization',
      name: siteName,
      url: baseUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${baseUrl}/icons/icon-512.png`
      }
    }
  }
}

// JSON-LD structured data for the organization
export function createOrganizationStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteName,
    url: baseUrl,
    logo: `${baseUrl}/icons/icon-512.png`,
    description,
    sameAs: [
      // Add social media URLs here when available
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Service',
      email: 'support@lootaura.app'
    }
  }
}
