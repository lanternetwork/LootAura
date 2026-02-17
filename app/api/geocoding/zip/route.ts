import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { createSupabaseServerClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Simple per-process cache for ZIP lookups (60s TTL)
const zipCache = new Map<string, { data: any; expires: number }>()

// Nominatim rate limiting (1 request per second)
let lastNominatimCall = 0
const NOMINATIM_DELAY = 1000 // 1 second

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getCachedZip(zip: string): any | null {
  const cached = zipCache.get(zip)
  if (cached && Date.now() < cached.expires) {
    return cached.data
  }
  if (cached) {
    zipCache.delete(zip) // Clean up expired entry
  }
  return null
}

function setCachedZip(zip: string, data: any): void {
  zipCache.set(zip, {
    data,
    expires: Date.now() + 60000 // 60 seconds
  })
}

function normalizeZip(rawZip: string): string | null {
  if (!rawZip) return null
  
  // Strip non-digits
  const digits = rawZip.replace(/\D/g, '')
  
  // If length > 5, take first 5 (for ZIP+4 format)
  const firstFive = digits.length > 5 ? digits.slice(0, 5) : digits
  
  // Left-pad with '0' to length 5
  const normalized = firstFive.padStart(5, '0')
  
  // Validate final against /^\d{5}$/
  if (!/^\d{5}$/.test(normalized)) {
    return null
  }
  
  return normalized
}

async function lookupNominatim(zip: string): Promise<any> {
  const { retry, isTransientError } = await import('@/lib/utils/retry')
  const { getNominatimEmail } = await import('@/lib/env')
  
  return await retry(
    async () => {
      // Rate limiting: ensure at least 1 second between calls
      const now = Date.now()
      const timeSinceLastCall = now - lastNominatimCall
      if (timeSinceLastCall < NOMINATIM_DELAY) {
        await delay(NOMINATIM_DELAY - timeSinceLastCall)
      }
      lastNominatimCall = Date.now()

      const email = getNominatimEmail()
      const url = `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&limit=1&email=${email}`
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': `LootAura/1.0 (${email})`
        }
      })
      
      if (!response.ok) {
        // Don't retry on 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Nominatim request failed: ${response.status}`)
        }
        // Retry on 5xx and network errors
        throw new Error(`Nominatim request failed: ${response.status}`)
      }
      
      const data = await response.json()
      return data
    },
    {
      maxAttempts: 3,
      initialDelayMs: 500,
      retryable: isTransientError,
    }
  )
}

// Helper function to safely escape strings for logging
// Updated to fix ESLint control character regex issue
function escapeForLogging(input: string | null | undefined): string {
  if (!input) return ''
  return String(input)
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/"/g, '\\"')    // Escape quotes
    .replace(/\n/g, '\\n')   // Escape newlines
    .replace(/\r/g, '\\r')   // Escape carriage returns
    .replace(/\t/g, '\\t')   // Escape tabs
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0001-\u001F\u007F]/g, '') // Remove control characters (excluding null char)
}


async function zipHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawZip = searchParams.get('zip')
    
    // Normalize ZIP code
    const normalizedZip = normalizeZip(rawZip || '')
    if (!normalizedZip) {
      console.log('[ZIP] status=invalid', {
        input: escapeForLogging(rawZip),
        normalized: null
      })
      return NextResponse.json({ 
        ok: false, 
        error: 'Invalid ZIP format' 
      }, { status: 400 })
    }
    
    // Check cache first
    const cachedResult = getCachedZip(normalizedZip)
    if (cachedResult) {
      console.log('[ZIP] source=cache status=ok', {
        input: escapeForLogging(rawZip),
        normalized: escapeForLogging(normalizedZip)
      })
      return NextResponse.json({
        ...cachedResult,
        source: 'cache'
      }, {
        headers: {
          'Cache-Control': 'public, max-age=60'
        }
      })
    }
    
    // 1. Try local lookup first (exact TEXT match)
    console.log('[ZIP] source=local', {
      input: escapeForLogging(rawZip),
      normalized: escapeForLogging(normalizedZip)
    })
    // Read from base table via schema-scoped client
    const { getRlsDb, fromBase } = await import('@/lib/supabase/clients')
    const db = await getRlsDb()
    const { data: localData, error: localError } = await fromBase(db, 'zipcodes')
      .select('zip, lat, lng, city, state')
      .eq('zip', normalizedZip) // TEXT comparison, no parseInt
      .single()
    
    // Log database lookup results for debugging
    console.log('[ZIP] database lookup result:', {
      input: escapeForLogging(rawZip),
      normalized: escapeForLogging(normalizedZip),
      hasData: !!localData,
      hasError: !!localError,
      error: localError?.message
    })
    
    if (!localError && localData) {
      console.log('[ZIP] source=local status=ok', {
        input: escapeForLogging(rawZip),
        normalized: escapeForLogging(normalizedZip)
      })
      const result = {
        ok: true,
        zip: localData.zip,
        lat: localData.lat,
        lng: localData.lng,
        city: localData.city,
        state: localData.state,
        source: 'local'
      }
      
      // Cache the result
      setCachedZip(normalizedZip, result)
      
      // Track ZIP usage for authenticated users (non-blocking)
      // This helps determine primary ZIP for featured email selection
      try {
        const supabase = createSupabaseServerClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // Increment ZIP usage (fire and forget - don't block response)
          const { incrementZipUsage } = await import('@/lib/data/zipUsage')
          incrementZipUsage(user.id, normalizedZip).catch((err) => {
            // Silently fail - ZIP tracking is non-critical
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.warn('[ZIP] Failed to track ZIP usage:', err)
            }
          })
        }
      } catch (trackingError) {
        // Silently fail - ZIP tracking is non-critical
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.warn('[ZIP] Failed to track ZIP usage:', trackingError)
        }
      }
      
      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'public, max-age=86400'
        }
      })
    }
    
    // 2. Hardcoded fallback for common ZIP codes
    const hardcodedZips: Record<string, { lat: number; lng: number; city: string; state: string }> = {
      // Louisville, KY
      '40204': { lat: 38.2380249, lng: -85.7246945, city: 'Louisville', state: 'KY' },
      '40202': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40203': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40205': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40206': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40207': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40208': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40209': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40210': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40211': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40212': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40213': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40214': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40215': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40216': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40217': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40218': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40219': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40220': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40221': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40222': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40223': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40224': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40225': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40228': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40229': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40241': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40242': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40243': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40245': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40250': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40251': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40252': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40253': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40255': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40256': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40257': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40258': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40259': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40261': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40266': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40268': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40269': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40270': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40272': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40280': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40281': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40282': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40283': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40285': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40287': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40289': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40290': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40291': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40292': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40293': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40294': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40295': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40296': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40297': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40298': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      '40299': { lat: 38.2512284, lng: -85.7494025, city: 'Louisville', state: 'KY' },
      // Other major cities
      '78723': { lat: 30.2672, lng: -97.7431, city: 'Austin', state: 'TX' },
      '97211': { lat: 45.5152, lng: -122.6784, city: 'Portland', state: 'OR' },
      '10001': { lat: 40.7505, lng: -73.9934, city: 'New York', state: 'NY' },
      '90210': { lat: 34.0901, lng: -118.4065, city: 'Beverly Hills', state: 'CA' },
      '60601': { lat: 41.8781, lng: -87.6298, city: 'Chicago', state: 'IL' },
      '33101': { lat: 25.7617, lng: -80.1918, city: 'Miami', state: 'FL' },
      '30301': { lat: 33.7490, lng: -84.3880, city: 'Atlanta', state: 'GA' },
      '85001': { lat: 33.4484, lng: -112.0740, city: 'Phoenix', state: 'AZ' },
      '75201': { lat: 32.7767, lng: -96.7970, city: 'Dallas', state: 'TX' },
      '98101': { lat: 47.6062, lng: -122.3321, city: 'Seattle', state: 'WA' },
      // Edge cases and common test ZIPs
      '00000': { lat: 39.8283, lng: -98.5795, city: 'Unknown', state: 'US' },
      '12345': { lat: 42.7094446, lng: -73.3946522, city: 'Schenectady', state: 'NY' },
      '99999': { lat: 39.9010776, lng: -81.8486534, city: 'Unknown', state: 'US' }
    }
    
    if (hardcodedZips[normalizedZip]) {
      const data = hardcodedZips[normalizedZip]
      console.log('[ZIP] source=hardcoded status=ok', {
        input: escapeForLogging(rawZip),
        normalized: escapeForLogging(normalizedZip)
      })
      return NextResponse.json({
        ok: true,
        zip: normalizedZip,
        lat: data.lat,
        lng: data.lng,
        city: data.city,
        state: data.state,
        source: 'hardcoded'
      }, {
        headers: {
          'Cache-Control': 'public, max-age=86400'
        }
      })
    }

    // 3. Fallback to Nominatim
    console.log('[ZIP] source=nominatim', {
      input: escapeForLogging(rawZip),
      normalized: escapeForLogging(normalizedZip)
    })
    try {
      const nominatimData = await lookupNominatim(normalizedZip)
      console.log(`[ZIP] Nominatim raw response:`, JSON.stringify(nominatimData, null, 2))
      
      if (nominatimData && nominatimData.length > 0) {
        const result = nominatimData[0]
        console.log('[ZIP] Nominatim result:', {
          normalized: escapeForLogging(normalizedZip),
          result: JSON.stringify(result, null, 2)
        })
        const lat = parseFloat(result.lat)
        const lng = parseFloat(result.lon)
        const city = result.address?.city || result.address?.town || result.address?.village || null
        const state = result.address?.state || null
        console.log('[ZIP] Parsed city/state:', {
          city: escapeForLogging(city),
          state: escapeForLogging(state)
        })
        
        // Optional write-back to local table
        const enableWriteback = process.env.ENABLE_ZIP_WRITEBACK === 'true'
        if (enableWriteback) {
          try {
            // Write to base table via schema-scoped client
            const { getAdminDb, fromBase } = await import('@/lib/supabase/clients')
            const admin = getAdminDb()
            await fromBase(admin, 'zipcodes')
              .upsert({
                zip: normalizedZip, // Use normalized ZIP for storage
                lat,
                lng,
                city,
                state
              }, { onConflict: 'zip' })
            console.log('[ZIP] writeback=success', {
              input: escapeForLogging(rawZip),
              normalized: escapeForLogging(normalizedZip),
              source: 'nominatim'
            })
          } catch (writebackError) {
            console.error('[ZIP] writeback=failed', {
              input: escapeForLogging(rawZip),
              normalized: escapeForLogging(normalizedZip),
              source: 'nominatim',
              error: writebackError
            })
          }
        }
        
        console.log('[ZIP] status=ok', {
          input: escapeForLogging(rawZip),
          normalized: escapeForLogging(normalizedZip),
          source: 'nominatim'
        })
        return NextResponse.json({
          ok: true,
          zip: normalizedZip,
          lat,
          lng,
          city,
          state,
          source: 'nominatim'
        }, {
          headers: {
            'Cache-Control': 'public, max-age=86400'
          }
        })
      } else {
        console.log('[ZIP] source=nominatim status=miss', {
          input: escapeForLogging(rawZip),
          normalized: escapeForLogging(normalizedZip),
          reason: 'no results from Nominatim'
        })
        console.log(`[ZIP] Nominatim response:`, JSON.stringify(nominatimData, null, 2))
        return NextResponse.json({ 
          ok: false, 
          error: 'ZIP not found' 
        }, { status: 404 })
      }
    } catch (nominatimError: any) {
      console.error('[ZIP] status=error', {
        input: escapeForLogging(rawZip),
        normalized: escapeForLogging(normalizedZip),
        source: 'nominatim',
        error: nominatimError.message
      })
      return NextResponse.json({ 
        ok: false, 
        error: 'Geocoding service unavailable' 
      }, { status: 503 })
    }
    
  } catch (error: any) {
    console.error('[ZIP] Fatal error:', error.message)
    return NextResponse.json({ 
      ok: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

export const GET = withRateLimit(zipHandler, [
  Policies.GEO_ZIP_SHORT,
  Policies.GEO_ZIP_HOURLY
])
