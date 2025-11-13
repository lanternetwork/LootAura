import { MetadataRoute } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { T } from '@/lib/supabase/tables'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createSupabaseServerClient()
  
  // Get all published sales for dynamic URLs
  const { data: sales } = await supabase
    .from(T.sales)
    .select('id, updated_at')
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
    .limit(1000) // Limit to prevent sitemap from being too large

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/explore`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/explore?tab=map`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/sales`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sell/new`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ]

  // Dynamic sale pages
  const salePages: MetadataRoute.Sitemap = (sales || []).map((sale) => ({
    url: `${baseUrl}/sales/${sale.id}`,
    lastModified: new Date(sale.updated_at),
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...staticPages, ...salePages]
}
