import { NextRequest, NextResponse } from 'next/server'
import { adminSupabase } from '@/lib/supabase/admin'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for large imports

/** Align with Vercel App Router body limits (~4.5MB). */
const MAX_BODY_BYTES = 4_500_000

interface ZipCodeRow {
  zip_code: string // Table uses zip_code, not zip
  city: string | null
  state: string | null
  lat: number
  lng: number
}

// Parse semicolon-delimited CSV line
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ';' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

// Parse Geo Point string "lat, lng" into numbers
function parseGeoPoint(geoPoint: string): { lat: number; lng: number } | null {
  if (!geoPoint || geoPoint.trim() === '') {
    return null
  }

  const parts = geoPoint.split(',').map(p => p.trim())
  if (parts.length !== 2) {
    return null
  }

  const lat = parseFloat(parts[0])
  const lng = parseFloat(parts[1])

  if (isNaN(lat) || isNaN(lng)) {
    return null
  }

  return { lat, lng }
}

// Normalize ZIP code
function normalizeZip(zip: string): string | null {
  if (!zip || zip.trim() === '') {
    return null
  }

  const cleaned = zip.trim().split('-')[0].replace(/\D/g, '')

  if (cleaned.length === 0 || cleaned.length > 5) {
    return null
  }

  return cleaned.padStart(5, '0')
}

async function insertBatch(batch: ZipCodeRow[]) {
  // Use dedicated RPC function to insert directly into lootaura_v2.zipcodes
  // This bypasses all REST API schema limitations
  const client = adminSupabase as any

  // Convert batch to JSON array for the RPC function
  const zipcodesJson = batch.map(row => ({
    zip_code: row.zip_code || '',
    city: row.city || null,
    state: row.state || null,
    lat: row.lat ?? null,
    lng: row.lng ?? null
  }))

  try {
    // Call the upsert_zipcodes RPC function
    const { data, error } = await client.rpc('upsert_zipcodes', {
      zipcodes_json: zipcodesJson
    })

    if (error) {
      // If function doesn't exist, try to create it on-the-fly
      if (error.message?.includes('Could not find the function') || error.message?.includes('does not exist')) {
        console.log('[ZIP_IMPORT] upsert_zipcodes function not found, attempting to create it...')
        await createUpsertZipcodesFunction(client)

        // Retry the RPC call
        const { data: retryData, error: retryError } = await client.rpc('upsert_zipcodes', {
          zipcodes_json: zipcodesJson
        })

        if (retryError) {
          throw retryError
        }

        if (retryData && !retryData.success) {
          throw new Error(retryData.error || 'Failed to insert ZIP codes')
        }

        return
      }

      throw error
    }

    // Check if the result indicates success
    if (data && !data.success) {
      throw new Error(data.error || 'Failed to insert ZIP codes')
    }

    return
  } catch (error: any) {
    // Provide helpful error message
    const errorMessage = error?.message || 'Unknown error'
    throw new Error(`Failed to insert ZIP codes: ${errorMessage}`)
  }
}

async function createUpsertZipcodesFunction(client: any) {
  // Create the upsert_zipcodes function if it doesn't exist
  // This allows the import to work even if the migration hasn't been applied
  const createFunctionSQL = `
    -- First, fix the trigger function to handle zipcodes table correctly
    CREATE OR REPLACE FUNCTION lootaura_v2.set_geom_from_coords()
    RETURNS TRIGGER AS $$
    BEGIN
        IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
            NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
        END IF;

        -- Only populate starts_at for sales table (which has date_start and time_start)
        -- For zipcodes table, skip this logic
        IF TG_TABLE_NAME = 'sales' THEN
            IF NEW.date_start IS NOT NULL AND NEW.time_start IS NOT NULL THEN
                NEW.starts_at = (NEW.date_start + NEW.time_start)::TIMESTAMPTZ;
            ELSIF NEW.date_start IS NOT NULL THEN
                NEW.starts_at = NEW.date_start::TIMESTAMPTZ;
            END IF;
        END IF;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Now create the upsert function
    CREATE OR REPLACE FUNCTION public.upsert_zipcodes(
        zipcodes_json JSONB
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, lootaura_v2
    AS $$
    DECLARE
        inserted_count INTEGER := 0;
        updated_count INTEGER := 0;
        error_count INTEGER := 0;
        result JSONB;
    BEGIN
        -- Insert/update ZIP codes from JSON array
        INSERT INTO lootaura_v2.zipcodes (zip_code, city, state, lat, lng)
        SELECT
            (zip->>'zip_code')::TEXT as zip_code,
            NULLIF(zip->>'city', 'null')::TEXT as city,
            NULLIF(zip->>'state', 'null')::TEXT as state,
            NULLIF((zip->>'lat')::TEXT, 'null')::NUMERIC(10, 8) as lat,
            NULLIF((zip->>'lng')::TEXT, 'null')::NUMERIC(11, 8) as lng
        FROM jsonb_array_elements(zipcodes_json) as zip
        WHERE zip->>'zip_code' IS NOT NULL
          AND zip->>'zip_code' != ''
          AND zip->>'lat' IS NOT NULL
          AND zip->>'lng' IS NOT NULL
        ON CONFLICT (zip_code)
        DO UPDATE SET
            city = EXCLUDED.city,
            state = EXCLUDED.state,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            updated_at = NOW();

        -- Count inserted (new) and updated (existing) rows
        GET DIAGNOSTICS inserted_count = ROW_COUNT;

        -- Return result summary
        result := jsonb_build_object(
            'success', true,
            'processed', jsonb_array_length(zipcodes_json),
            'inserted', inserted_count
        );

        RETURN result;
    EXCEPTION
        WHEN OTHERS THEN
            -- Return error information
            RETURN jsonb_build_object(
                'success', false,
                'error', SQLERRM,
                'processed', 0
            );
    END;
    $$;

    -- Grant execute permission
    GRANT EXECUTE ON FUNCTION public.upsert_zipcodes(JSONB) TO authenticated, anon;
  `

  try {
    // Try using exec RPC if it exists
    const { error: execError } = await client.rpc('exec', { sql: createFunctionSQL })
    if (!execError) {
      console.log('[ZIP_IMPORT] Successfully created upsert_zipcodes function')
      return
    }

    // If exec doesn't work, try exec_sql
    const { error: execSqlError } = await client.rpc('exec_sql', { sql: createFunctionSQL })
    if (!execSqlError) {
      console.log('[ZIP_IMPORT] Successfully created upsert_zipcodes function via exec_sql')
      return
    }

    // If neither RPC works, throw an error
    throw new Error(`Unable to create function: ${execError?.message || execSqlError?.message || 'No exec RPC available'}`)
  } catch (error: any) {
    console.error('[ZIP_IMPORT] Failed to create function:', error)
    throw new Error(`Failed to create upsert_zipcodes function. Please apply migration 053_insert_zipcodes_rpc.sql manually. Error: ${error.message}`)
  }
}

// Import from CSV text (JSON body field `fileContent` only)
async function importFromContent(fileContent: string) {
  const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '')

  if (lines.length === 0) {
    throw new Error('File is empty')
  }

  let header: string[] | null = null
  let rowCount = 0
  let validCount = 0
  let skippedCount = 0
  let batch: ZipCodeRow[] = []
  const BATCH_SIZE = 1000

  for (const line of lines) {
    const columns = parseCSVLine(line)

    if (!header) {
      header = columns
      continue
    }

    rowCount++

    const row: Record<string, string> = {}
    header.forEach((col, idx) => {
      row[col] = columns[idx] || ''
    })

    const rawZip = row['Zip Code']
    const city = row['Official USPS city name'] || null
    const state = row['Official USPS State Code'] || null
    const geoPoint = row['Geo Point'] || ''

    const zip = normalizeZip(rawZip)
    if (!zip) {
      skippedCount++
      continue
    }

    const coords = parseGeoPoint(geoPoint)
    if (!coords) {
      skippedCount++
      continue
    }

    batch.push({
      zip_code: zip, // Use zip_code to match table column
      city: city || null,
      state: state || null,
      lat: coords.lat,
      lng: coords.lng
    })

    validCount++

    if (batch.length >= BATCH_SIZE) {
      await insertBatch(batch)
      batch = []
    }
  }

  if (batch.length > 0) {
    await insertBatch(batch)
  }

  return { rowCount, validCount, skippedCount }
}

/**
 * POST /api/admin/zipcodes/import
 *
 * Production: returns 404 unless ENABLE_ADMIN_ZIPCODE_IMPORT=true.
 * Body (application/json only): { "fileContent": "<CSV string>" }
 */
async function postImportHandler(request: NextRequest): Promise<NextResponse> {
  try {
    await assertAdminOrThrow(request)

    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_ADMIN_ZIPCODE_IMPORT !== 'true') {
      return new NextResponse('Not found', { status: 404 })
    }

    const contentType = request.headers.get('content-type') || ''
    if (!contentType.toLowerCase().includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 415 }
      )
    }

    const contentLength = request.headers.get('content-length')
    if (contentLength !== null) {
      const n = parseInt(contentLength, 10)
      if (!Number.isNaN(n) && n > MAX_BODY_BYTES) {
        return NextResponse.json(
          { error: 'Payload too large', maxBytes: MAX_BODY_BYTES },
          { status: 413 }
        )
      }
    }

    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: 'Payload too large', maxBytes: MAX_BODY_BYTES },
        { status: 413 }
      )
    }

    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 })
    }

    const fileContent = (body as { fileContent?: unknown }).fileContent
    if (typeof fileContent !== 'string') {
      return NextResponse.json(
        { error: 'fileContent is required and must be a string' },
        { status: 400 }
      )
    }

    const result = await importFromContent(fileContent)

    return NextResponse.json({
      success: true,
      ...result
    })
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    console.error('[ZIP_IMPORT] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Import failed'
      },
      { status: 500 }
    )
  }
}

export const POST = withRateLimit(postImportHandler, [
  Policies.AUTH_DEFAULT,
  Policies.AUTH_HOURLY
])
