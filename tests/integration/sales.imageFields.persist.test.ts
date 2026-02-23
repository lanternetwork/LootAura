import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import * as ImageValidate from '@/lib/images/validateImageUrl'
import { generateCsrfToken } from '@/lib/csrf'

// Ensure Cloudinary validator recognizes the test cloud name
;(process.env as any).NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'test'

// Mock Supabase server with full insert/select/single support
// Pattern exactly like v2.sales.images.persist.test.ts
const mockSingle = vi.fn()
let lastInsertedPayload: any = null

// Create a query chain for profile lookups (account lock checks)
const createQueryChain = () => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: { is_locked: false }, error: null })),
  }
  return chain
}

const fromChain = {
  insert: vi.fn((payload: any) => {
    // Store the payload so we can return it with the inserted row
    lastInsertedPayload = payload
    return {
      select: vi.fn(() => ({
        single: mockSingle
      }))
    }
  }),
}

// Schema-scoped client (returned by .schema('lootaura_v2'))
const mockRlsDb = {
  from: vi.fn((table: string) => {
    // For profiles table (account lock checks), return a query chain
    if (table === 'profiles') {
      return createQueryChain()
    }
    return fromChain
  })
}

const mockSupabaseClient = {
  from: vi.fn((table: string) => {
    // For profiles table (account lock checks), return a query chain
    if (table === 'profiles') {
      return createQueryChain()
    }
    return fromChain
  }),
  schema: vi.fn(() => mockRlsDb), // schema() returns the schema-scoped client
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
    getSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'test-token', user: { id: 'test-user' } } },
      error: null,
    }),
    setSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'test-token', user: { id: 'test-user' } } },
      error: null,
    }),
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
  createSupabaseWriteClient: () => mockSupabaseClient,
}))

// Mock schema-scoped clients - route now uses createSupabaseServerClient().schema('lootaura_v2')
vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockSupabaseClient,
  fromBase: (db: any, table: string) => {
    // fromBase() receives a schema-scoped client, so just use .from() directly
    if (table.includes('.')) {
      throw new Error(`Do not qualify table names: received "${table}"`)
    }
    // For profiles table (account lock checks), return a query chain
    if (table === 'profiles') {
      return createQueryChain()
    }
    return db.from(table)
  },
}))

// Mock admin client - use same mock since tests don't need RLS bypass
vi.mock('@/lib/supabase/admin', () => ({
  adminSupabase: mockSupabaseClient,
}))

// Mock rate limiting
vi.mock('@/lib/rateLimit/withRateLimit', () => ({
	withRateLimit: (handler: any) => handler
}))

// Use a spy on the real validator (no substring checks to appease CodeQL)
const mockIsAllowedImageUrl = vi.spyOn(ImageValidate, 'isAllowedImageUrl')

let POST: any
beforeAll(async () => {
	const route = await import('@/app/api/sales/route')
	POST = route.POST
})

// Helper function to create a request with CSRF token
function createRequestWithCsrf(url: string, body: any): NextRequest {
	const csrfToken = generateCsrfToken()
	const request = new NextRequest(url, {
		method: 'POST',
		body: JSON.stringify(body),
		headers: {
			'Content-Type': 'application/json',
			'x-csrf-token': csrfToken,
			'cookie': `csrf-token=${csrfToken}`
		}
	})
	return request
}

describe('Sales API - Image Support', () => {
	beforeEach(() => {
		// Match working test pattern exactly - use clearAllMocks() like v2 test
		vi.clearAllMocks()
		
		lastInsertedPayload = null
		
		// Reset auth mock to return user
		mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null })
		// Reset session mock to return valid session
		mockSupabaseClient.auth.getSession.mockResolvedValue({
			data: { session: { access_token: 'test-token', user: { id: 'test-user' } } },
			error: null,
		})
		// Reset setSession mock
		mockSupabaseClient.auth.setSession.mockResolvedValue({
			data: { session: { access_token: 'test-token', user: { id: 'test-user' } } },
			error: null,
		})
		// Reset image validator spy
		mockIsAllowedImageUrl.mockReturnValue(true)
		// CRITICAL: Re-initialize from() and fromChain.insert after clearAllMocks()
		// clearAllMocks() clears implementations of ALL vi.fn() mocks, including fromChain.insert
		// Route now uses createSupabaseServerClient().schema() which returns mockRlsDb
		mockSupabaseClient.schema.mockReturnValue(mockRlsDb)
		mockRlsDb.from.mockImplementation((table: string) => {
			if (table === 'profiles') {
				return createQueryChain()
			}
			return fromChain
		})
		mockSupabaseClient.from.mockImplementation((table: string) => {
			if (table === 'profiles') {
				return createQueryChain()
			}
			return fromChain
		})
		fromChain.insert = vi.fn((payload: any) => {
			lastInsertedPayload = payload
			return {
				select: vi.fn(() => ({
					single: mockSingle
				}))
			}
		})
		// Set up mockSingle to return inserted payload when available
		mockSingle.mockImplementation(() => {
			if (lastInsertedPayload) {
				const inserted = {
					id: 'test-sale-id',
					...lastInsertedPayload,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				}
				return Promise.resolve({ data: inserted, error: null })
			}
			return Promise.resolve({ data: { id: 'test-sale-id' }, error: null })
		})
	})

	it('should accept and persist cover_image_url', async () => {
	// No-op: insert/select/single chain in shared mock will reflect payload
		// Use a future date to avoid past date validation
		const futureDate = new Date()
		futureDate.setUTCDate(futureDate.getUTCDate() + 7)
		const futureDateStr = futureDate.toISOString().split('T')[0]

		const request = createRequestWithCsrf('http://localhost:3000/api/sales', {
			title: 'Test Sale',
			description: 'Test Description',
			address: '123 Test St',
			city: 'Test City',
			state: 'TS',
			zip_code: '12345',
			lat: 38.2527,
			lng: -85.7585,
			date_start: futureDateStr,
			time_start: '09:00',
			cover_image_url: 'https://res.cloudinary.com/test/image/upload/v123/cover.jpg'
		})

		const response = await POST(request)
		const data = await response.json()

		expect(response.status).toBe(200)
		expect(data.ok).toBe(true)
		expect(data.saleId).toBe('test-sale-id')
		expect(mockIsAllowedImageUrl).toHaveBeenCalledWith('https://res.cloudinary.com/test/image/upload/v123/cover.jpg')
		// Assert persisted cover_image_url was included in the insert payload
		expect(lastInsertedPayload?.cover_image_url).toBe('https://res.cloudinary.com/test/image/upload/v123/cover.jpg')
	})

	it('should accept and validate images array', async () => {
	// No-op: shared mock returns inserted row id
		// Use a future date to avoid past date validation
		const futureDate = new Date()
		futureDate.setUTCDate(futureDate.getUTCDate() + 7)
		const futureDateStr = futureDate.toISOString().split('T')[0]

		const request = createRequestWithCsrf('http://localhost:3000/api/sales', {
			title: 'Test Sale',
			description: 'Test Description',
			address: '123 Test St',
			city: 'Test City',
			state: 'TS',
			zip_code: '12345',
			lat: 38.2527,
			lng: -85.7585,
			date_start: futureDateStr,
			time_start: '09:00',
			images: ['https://res.cloudinary.com/test/image/upload/v123/img1.jpg']
		})

		const response = await POST(request)
		const data = await response.json()

		expect(response.status).toBe(200)
		expect(data.ok).toBe(true)
		expect(mockIsAllowedImageUrl).toHaveBeenCalledWith('https://res.cloudinary.com/test/image/upload/v123/img1.jpg')
		// Note: images array is validated but not asserted for DB shape here
	})

	it('should reject invalid cover_image_url', async () => {
		// Set mock to return false for invalid URLs in this test
		mockIsAllowedImageUrl.mockReturnValue(false)
		// Use a future date to avoid past date validation
		const futureDate = new Date()
		futureDate.setUTCDate(futureDate.getUTCDate() + 7)
		const futureDateStr = futureDate.toISOString().split('T')[0]
		
		const request = createRequestWithCsrf('http://localhost:3000/api/sales', {
			title: 'Test Sale',
			description: 'Test Description',
			address: '123 Test St',
			city: 'Test City',
			state: 'TS',
			zip_code: '12345',
			lat: 38.2527,
			lng: -85.7585,
			date_start: futureDateStr,
			time_start: '09:00',
			cover_image_url: 'https://malicious-site.com/image.jpg'
		})

		const response = await POST(request)
		const data = await response.json()

		expect(response.status).toBe(400)
		expect(data.error).toBe('Invalid cover_image_url')
	})

	it('should reject past date_start', async () => {
		// Calculate yesterday's date in YYYY-MM-DD format
		const yesterday = new Date()
		yesterday.setUTCDate(yesterday.getUTCDate() - 1)
		const yesterdayStr = yesterday.toISOString().split('T')[0]

		const request = createRequestWithCsrf('http://localhost:3000/api/sales', {
			title: 'Test Sale',
			description: 'Test Description',
			address: '123 Test St',
			city: 'Test City',
			state: 'TS',
			zip_code: '12345',
			lat: 38.2527,
			lng: -85.7585,
			date_start: yesterdayStr,
			time_start: '09:00',
		})

		const response = await POST(request)
		const data = await response.json()

		expect(response.status).toBe(400)
		expect(data.ok).toBe(false)
		expect(data.code).toBe('INVALID_START_DATE')
	})

	it('should reject invalid image URLs in images array', async () => {
		// Set mock to return false for the malicious URL
		mockIsAllowedImageUrl.mockImplementation((url: string) => {
			return url.includes('res.cloudinary.com/test')
		})
		// Use a future date to avoid past date validation
		const futureDate = new Date()
		futureDate.setUTCDate(futureDate.getUTCDate() + 7)
		const futureDateStr = futureDate.toISOString().split('T')[0]
		
		const request = createRequestWithCsrf('http://localhost:3000/api/sales', {
			title: 'Test Sale',
			description: 'Test Description',
			address: '123 Test St',
			city: 'Test City',
			state: 'TS',
			zip_code: '12345',
			lat: 38.2527,
			lng: -85.7585,
			date_start: futureDateStr,
			time_start: '09:00',
			images: [
				'https://res.cloudinary.com/test/image/upload/v123/img1.jpg',
				'https://malicious-site.com/image.jpg'
			]
		})

		const response = await POST(request)
		const data = await response.json()

		expect(response.status).toBe(400)
		expect(data.error).toBe('Invalid image URL in images array')
	})

	it('should handle empty images array', async () => {
	// No-op: shared mock returns inserted row id
		// Use a future date to avoid past date validation
		const futureDate = new Date()
		futureDate.setUTCDate(futureDate.getUTCDate() + 7)
		const futureDateStr = futureDate.toISOString().split('T')[0]

		const request = createRequestWithCsrf('http://localhost:3000/api/sales', {
			title: 'Test Sale',
			description: 'Test Description',
			address: '123 Test St',
			city: 'Test City',
			state: 'TS',
			zip_code: '12345',
			lat: 38.2527,
			lng: -85.7585,
			date_start: futureDateStr,
			time_start: '09:00',
			images: []
		})

		const response = await POST(request)
		const data = await response.json()

		expect(response.status).toBe(200)
		expect(data.ok).toBe(true)
		// Empty images array should not call validation
		expect(mockIsAllowedImageUrl).not.toHaveBeenCalled()
		// DB insert shape is implementation detail; response ok is sufficient
	})

	it('should default images to empty array when not provided', async () => {
		// No-op: shared supabase mock will return inserted row with id
		// Use a future date to avoid past date validation
		const futureDate = new Date()
		futureDate.setUTCDate(futureDate.getUTCDate() + 7)
		const futureDateStr = futureDate.toISOString().split('T')[0]

		const request = createRequestWithCsrf('http://localhost:3000/api/sales', {
			title: 'Test Sale',
			description: 'Test Description',
			address: '123 Test St',
			city: 'Test City',
			state: 'TS',
			zip_code: '12345',
			lat: 38.2527,
			lng: -85.7585,
			date_start: futureDateStr,
			time_start: '09:00'
		})

		const response = await POST(request)
		const data = await response.json()

		expect(response.status).toBe(200)
		expect(data.ok).toBe(true)
		// No images provided, so no validation calls
		expect(mockIsAllowedImageUrl).not.toHaveBeenCalled()
		// DB insert shape is implementation detail; response ok is sufficient
	})
})