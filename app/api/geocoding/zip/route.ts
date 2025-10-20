import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Nominatim rate limiting (1 request per second)
let lastNominatimCall = 0
const NOMINATIM_DELAY = 1000 // 1 second

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeZip(rawZip: string): string | null {
  if (!rawZip) return null
  
  // Strip non-digits
  const digits = rawZip.replace(/\D/g, '')
  
  // If length > 5, take last 5
  const lastFive = digits.length > 5 ? digits.slice(-5) : digits
  
  // Left-pad with '0' to length 5
  const normalized = lastFive.padStart(5, '0')
  
  // Validate final against /^\d{5}$/
  if (!/^\d{5}$/.test(normalized)) {
    return null
  }
  
  return normalized
}

async function lookupNominatim(zip: string): Promise<any> {
  // Rate limiting: ensure at least 1 second between calls
  const now = Date.now()
  const timeSinceLastCall = now - lastNominatimCall
  if (timeSinceLastCall < NOMINATIM_DELAY) {
    await delay(NOMINATIM_DELAY - timeSinceLastCall)
  }
  lastNominatimCall = Date.now()

  const email = process.env.NOMINATIM_EMAIL || 'admin@lootaura.com'
  const url = `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=json&limit=1&email=${email}`
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': `LootAura/1.0 (${email})`
    }
  })
  
  if (!response.ok) {
    throw new Error(`Nominatim request failed: ${response.status}`)
  }
  
  const data = await response.json()
  return data
}

// Helper function to safely escape strings for logging
function escapeForLogging(input: string | null | undefined): string {
  if (!input) return ''
  return String(input)
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/"/g, '\\"')    // Escape quotes
    .replace(/\n/g, '\\n')   // Escape newlines
    .replace(/\r/g, '\\r')   // Escape carriage returns
    .replace(/\t/g, '\\t')   // Escape tabs
    .replace(/[\u0000-\u001F\u007F]/g, '') // Remove control characters
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawZip = searchParams.get('zip')
    
    // Normalize ZIP code
    const normalizedZip = normalizeZip(rawZip || '')
    if (!normalizedZip) {
      console.log(`[ZIP] input="${rawZip}" normalized=null status=invalid`)
      return NextResponse.json({ 
        ok: false, 
        error: 'Invalid ZIP format' 
      }, { status: 400 })
    }
    
    const supabase = createSupabaseServerClient()
    
    // 1. Try local lookup first (exact TEXT match)
    console.log(`[ZIP] input="${rawZip}" normalized=${normalizedZip} source=local`)
    const { data: localData, error: localError } = await supabase
      .from('lootaura_v2.zipcodes')
      .select('zip, lat, lng, city, state')
      .eq('zip', normalizedZip) // TEXT comparison, no parseInt
      .single()
    
    if (!localError && localData) {
      console.log(`[ZIP] input="${rawZip}" normalized=${normalizedZip} source=local status=ok`)
      return NextResponse.json({
        ok: true,
        zip: localData.zip,
        lat: localData.lat,
        lng: localData.lng,
        city: localData.city,
        state: localData.state,
        source: 'local'
      }, {
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
      '98101': { lat: 47.6062, lng: -122.3321, city: 'Seattle', state: 'WA' }
    }
    
    if (hardcodedZips[normalizedZip]) {
      const data = hardcodedZips[normalizedZip]
      console.log(`[ZIP] input="${rawZip}" normalized=${normalizedZip} source=hardcoded status=ok`)
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
    console.log(`[ZIP] input="${rawZip}" normalized=${normalizedZip} source=nominatim`)
    try {
      const nominatimData = await lookupNominatim(normalizedZip)
      console.log(`[ZIP] Nominatim raw response:`, JSON.stringify(nominatimData, null, 2))
      
      if (nominatimData && nominatimData.length > 0) {
        const result = nominatimData[0]
        console.log(`[ZIP] Nominatim result for ${normalizedZip}:`, JSON.stringify(result, null, 2))
        const lat = parseFloat(result.lat)
        const lng = parseFloat(result.lon)
        const city = result.address?.city || result.address?.town || result.address?.village || null
        const state = result.address?.state || null
        console.log(`[ZIP] Parsed city/state: city=${city}, state=${state}`)
        
        // Optional write-back to local table
        const enableWriteback = process.env.ENABLE_ZIP_WRITEBACK === 'true'
        if (enableWriteback) {
          try {
            await supabase
              .from('lootaura_v2.zipcodes')
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
        console.log(`[ZIP] input="${rawZip}" normalized=${normalizedZip} source=nominatim status=miss - no results from Nominatim`)
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
