import { Metadata } from 'next'
import { Sale } from '@/lib/types'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.app'
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
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  }
}

export function createSaleMetadata(sale: Sale): Metadata {
  const title = sale.title
  const description = sale.description || `Yard sale at ${sale.address || sale.city || 'your area'}. ${sale.date_start ? `Starts ${new Date(sale.date_start).toLocaleDateString()}` : ''}`
  const image = '/og-sale.jpg' // photos field doesn't exist in new schema
  const path = `/sale/${sale.id}`

  return createPageMetadata({
    title,
    description,
    path,
    image,
    type: 'article'
  })
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
