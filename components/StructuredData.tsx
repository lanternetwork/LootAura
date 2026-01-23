import { Sale } from '@/lib/types'

interface StructuredDataProps {
  sale: Sale
  type?: 'Event' | 'Product'
}

export default function StructuredData({ sale, type = 'Event' }: StructuredDataProps) {
  if (type === 'Event') {
    const eventData = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: sale.title,
      description: sale.description,
      startDate: sale.date_start ? `${sale.date_start}T${sale.time_start}` : undefined,
      endDate: sale.date_end ? `${sale.date_end}T${sale.time_end}` : undefined,
      location: {
        '@type': 'Place',
        name: sale.address,
        address: {
          '@type': 'PostalAddress',
          streetAddress: sale.address,
          addressLocality: sale.city,
          addressRegion: sale.state,
          postalCode: sale.zip_code,
          addressCountry: 'US'
        },
        geo: sale.lat && sale.lng ? {
          '@type': 'GeoCoordinates',
          latitude: sale.lat,
          longitude: sale.lng
        } : undefined
      },
      offers: sale.price ? {
        '@type': 'Offer',
        price: sale.price,
        priceCurrency: 'USD'
      } : undefined,
      organizer: {
        '@type': 'Organization',
        name: 'LootAura',
        url: process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'
      },
      eventStatus: sale.status === 'published' ? 'https://schema.org/EventScheduled' : 'https://schema.org/EventCancelled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      image: undefined, // photos field doesn't exist in new schema
      keywords: sale.tags?.join(', '),
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'}/sale/${sale.id}`
    }

    return (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventData) }}
      />
    )
  }

  if (type === 'Product') {
    const productData = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: sale.title,
      description: sale.description,
      image: [], // photos field doesn't exist in new schema
      offers: sale.price ? {
        '@type': 'Offer',
        price: sale.price,
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        seller: {
          '@type': 'Organization',
          name: 'LootAura'
        }
      } : undefined,
      category: 'Yard Sale Items',
      keywords: sale.tags?.join(', '),
      url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'}/sale/${sale.id}`
    }

    return (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productData) }}
      />
    )
  }

  return null
}
