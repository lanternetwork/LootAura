import { readFileSync } from 'fs'
import { join } from 'path'
import { vi } from 'vitest'

// Load address fixtures
const addresses = JSON.parse(
  readFileSync(join(process.cwd(), 'tests', 'fixtures', 'addresses.json'), 'utf-8')
)

export interface MockAddress {
  address: string
  lat: number
  lng: number
  formatted_address: string
  city: string
  state: string
  zip: string
}

// Removed Google Maps mocks (no longer used)

// Nominatim Mock
export function mockNominatimFetch() {
  const originalFetch = global.fetch
  
  global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const urlString = url.toString()
    
    // Validate URL is safe for testing
    try {
      const urlObj = new URL(urlString)
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('Invalid protocol')
      }
    } catch {
      throw new Error('Invalid URL')
    }
    
    // Check for allowed external service with proper validation
    const allowedExternalServices = ['nominatim.openstreetmap.org']
    const isAllowedService = allowedExternalServices.some(service => 
      urlString.includes(service)
    )
    
    if (isAllowedService) {
      const searchParams = new URL(urlString).searchParams
      const query = searchParams.get('q')
      
      const address = addresses.find((addr: MockAddress) => 
        addr.address.toLowerCase().includes(query?.toLowerCase() || '') ||
        addr.formatted_address.toLowerCase().includes(query?.toLowerCase() || '')
      )

      if (address) {
        return new Response(JSON.stringify([{
          lat: address.lat.toString(),
          lon: address.lng.toString(),
          display_name: address.formatted_address,
          address: {
            city: address.city,
            state: address.state,
            postcode: address.zip
          }
        }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return originalFetch(url, init)
  }

  return () => {
    global.fetch = originalFetch
  }
}

// Supabase Client Mock
export function createMockSupabaseClient() {
  const mockSales: any[] = []
  let nextId = 1

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } }
      }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn()
    },
    from: (table: string) => {
      if (table === 'yard_sales') {
        return {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockImplementation((data: any) => {
            const newSale = {
              id: `sale-${nextId++}`,
              ...data[0],
              owner_id: 'test-user-id',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
            mockSales.push(newSale)
            return {
              data: [newSale],
              error: null
            }
          }),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            return {
              data: mockSales[0] || null,
              error: null
            }
          })
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null })
      }
    },
    rpc: vi.fn().mockImplementation((functionName: string, params: any) => {
      if (functionName === 'search_sales') {
        return {
          data: mockSales,
          error: null
        }
      }
      return {
        data: [],
        error: null
      }
    })
  }
}

// Enable/Disable functions for E2E
export function enableMocks() {
  // Mock Supabase
  vi.mock('@/lib/supabase/client', () => ({
    createSupabaseBrowserClient: () => createMockSupabaseClient()
  }))

  // Mock geocoding
  vi.mock('@/lib/geocode', () => ({
    geocodeAddress: vi.fn().mockImplementation(async (address: string) => {
      const found = addresses.find((addr: MockAddress) => 
        addr.address.toLowerCase().includes(address.toLowerCase()) ||
        addr.formatted_address.toLowerCase().includes(address.toLowerCase())
      )
      
      if (found) {
        return {
          lat: found.lat,
          lng: found.lng,
          formatted_address: found.formatted_address,
          city: found.city,
          state: found.state,
          zip: found.zip
        }
      }
      return null
    })
  }))
}

export function disableMocks() {
  vi.restoreAllMocks()
}

// Helper to get address fixtures
export function getAddressFixtures(): MockAddress[] {
  return addresses
}
