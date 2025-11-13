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

export function createSaleMetadata(
  sale: Sale,
  options?: { categories?: string[] }
): Metadata {
  const title = sale.title || 'Yard Sale'
  
  // Build description with location, date, and categories
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
  
  // Extract top 2-3 categories from tags and provided categories
  const allCategories = [
    ...(Array.isArray(sale.tags) ? sale.tags : []),
    ...(options?.categories || [])
  ]
  const uniqueCategories = Array.from(new Set(allCategories)).filter(Boolean).slice(0, 3)
  const categoryText = uniqueCategories.length > 0 
    ? uniqueCategories.join(', ')
    : null
  
  // Build description: prioritize sale.description, but enhance with location/date/categories if missing
  let description = sale.description
  if (!description || description.trim().length === 0) {
    const parts: string[] = []
    
    // Location
    if (locationParts.length > 0) {
      parts.push(`Yard sale in ${locationParts.join(', ')}`)
    } else {
      parts.push('Yard sale')
    }
    
    // Date
    if (dateParts.length > 0) {
      parts.push(`on ${dateParts.join(', ')}`)
    }
    
    // Categories (if available)
    if (categoryText) {
      parts.push(`— ${categoryText}`)
    }
    
    description = parts.join(' ')
  } else if (categoryText) {
    // If description exists, append categories if they add value and we have room
    const descWithCats = `${description} — ${categoryText}`
    if (descWithCats.length <= 160) {
      description = descWithCats
    }
  }
  
  // Truncate description to ~160 characters for optimal social sharing
  if (description.length > 160) {
    description = description.substring(0, 157) + '...'
  }
  
  // Get cover image - prefer cover_image_url, then first image from images array
  const cover = getSaleCoverUrl(sale)
  let image = cover?.url || `${baseUrl}/og-default.png`
  
  // Ensure image URL is absolute (Cloudinary URLs are already absolute, but handle relative paths)
  if (image && !image.startsWith('http://') && !image.startsWith('https://')) {
    image = image.startsWith('/') ? `${baseUrl}${image}` : `${baseUrl}/${image}`
  }
  
  // Build canonical URL (without UTM params)
  const path = `/sales/${sale.id}`
  const canonicalUrl = `${baseUrl}${path}`

  // Truncate title for metadata (max 60 chars)
  const metaTitle = title.length > 60 ? title.substring(0, 57) + '...' : title

  // Safely construct metadataBase
  let metadataBaseUrl: URL | undefined
  try {
    metadataBaseUrl = new URL(baseUrl)
  } catch (error) {
    // If baseUrl is invalid, don't set metadataBase
    console.warn('[METADATA] Invalid baseUrl for metadataBase:', baseUrl)
  }

  return {
    title: `${metaTitle} | ${siteName}`,
    description,
    ...(metadataBaseUrl && { metadataBase: metadataBaseUrl }),
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
