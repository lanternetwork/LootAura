import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.app'
  
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/account/',
          '/dashboard/',
          '/auth/',
          '/sell/',
          '/favorites/',
          '/_next/',
          '/check-categories/',
          '/migrate/',
          '/seed/',
          '/setup-reviews/',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/account/',
          '/dashboard/',
          '/auth/',
          '/sell/',
          '/favorites/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}

