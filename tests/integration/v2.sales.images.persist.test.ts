import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as ImageValidate from '@/lib/images/validateImageUrl'

;(process.env as any).NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'test'

// Minimal supabase mock for v2 sales route
const mockSingle = vi.fn()
const fromChain = {
  insert: vi.fn(() => ({ select: vi.fn(() => ({ single: mockSingle })) })),
}
const mockSupabaseClient = {
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
  from: vi.fn(() => fromChain),
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}))

const isAllowedSpy = vi.spyOn(ImageValidate, 'isAllowedImageUrl')

let POST: any
beforeAll(async () => {
  const route = await import('@/app/api/v2/sales/route')
  POST = route.POST
})

describe('v2 Sales API - images persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSingle.mockResolvedValue({ data: { id: 's1' }, error: null })
  })

  it('persists cover_image_url and images array when valid', async () => {
    const request = new NextRequest('http://localhost/api/v2/sales', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test', city: 'X', state: 'YY', date_start: '2024-01-01', time_start: '09:00',
        cover_image_url: 'https://res.cloudinary.com/test/image/upload/v1/cover.jpg',
        images: ['https://res.cloudinary.com/test/image/upload/v1/a.jpg']
      }),
    })

    const res = await POST(request)
    expect(res.status).toBe(200)
    expect(isAllowedSpy).toHaveBeenCalledWith('https://res.cloudinary.com/test/image/upload/v1/cover.jpg')
    expect(isAllowedSpy).toHaveBeenCalledWith('https://res.cloudinary.com/test/image/upload/v1/a.jpg')
    expect(mockSupabaseClient.from).toHaveBeenCalled()
  })

  it('rejects when any image URL is not allow-listed', async () => {
    const request = new NextRequest('http://localhost/api/v2/sales', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test', city: 'X', state: 'YY', date_start: '2024-01-01', time_start: '09:00',
        images: ['https://malicious.site/x.jpg']
      }),
    })
    const res = await POST(request)
    expect(res.status).toBe(400)
  })
})

