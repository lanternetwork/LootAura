import type { Sale } from '@/lib/types'

/**
 * Returns demo/test sales for UI display only
 * These should NOT be injected into API responses or map pins
 */
export function getDemoSales(): (Sale & { is_demo?: boolean })[] {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  
  return [
    {
      id: 'demo-001',
      owner_id: '00000000-0000-0000-0000-000000000000',
      title: 'Demo: Neighborhood Yard Sale',
      description: 'A sample yard sale showcasing various household items, furniture, and collectibles.',
      address: '123 Demo St',
      city: 'Louisville',
      state: 'KY',
      zip_code: '40204',
      date_start: today,
      time_start: '08:00',
      date_end: today,
      time_end: '14:00',
      lat: 38.241,
      lng: -85.719,
      cover_image_url: null,
      images: [],
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      is_demo: true,
    },
    {
      id: 'demo-002',
      owner_id: '00000000-0000-0000-0000-000000000000',
      title: 'Demo: Multi-family Sale',
      description: 'Multiple families coming together for a community yard sale event.',
      address: '456 Example Ave',
      city: 'Louisville',
      state: 'KY',
      zip_code: '40204',
      date_start: tomorrow,
      time_start: '09:00',
      date_end: tomorrow,
      time_end: '16:00',
      lat: 38.238,
      lng: -85.722,
      cover_image_url: null,
      images: [],
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      is_demo: true,
    },
  ]
}

