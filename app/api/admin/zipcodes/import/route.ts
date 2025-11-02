import { NextRequest, NextResponse } from 'next/server'
import { createReadStream, existsSync } from 'fs'
import { createInterface } from 'readline'
import { resolve, normalize, relative } from 'path'
import { ENV_PUBLIC, ENV_SERVER } from '@/lib/env'
import { adminSupabase } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for large imports

// Note: Vercel has a 4.5MB request body limit for App Router routes.
// For larger files, use the server-side file path option in local development,
// or split the CSV into smaller batches.

interface ZipCodeRow {
  zip_code: string  // Table uses zip_code, not zip
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

async function importFromPath(csvFilePath: string) {
  // Validate and sanitize file path to prevent path traversal attacks
  if (!csvFilePath || typeof csvFilePath !== 'string' || csvFilePath.trim() === '') {
    throw new Error('Invalid file path')
  }
  
  // Define allowed base directory for imports
  // Restrict to a safe directory to prevent path traversal
  const ALLOWED_BASE_DIR = process.env.IMPORT_BASE_DIR || process.cwd()
  const allowedBaseDir = resolve(ALLOWED_BASE_DIR)
  
  // Check for dangerous path traversal sequences
  if (csvFilePath.includes('..') || csvFilePath.includes('~')) {
    throw new Error('Invalid file path: path traversal detected')
  }
  
  // Normalize the path to handle redundant separators
  // Remove leading slashes to prevent absolute path attacks
  const sanitizedPath = csvFilePath.replace(/^[/\\]+/, '')
  const normalizedPath = normalize(sanitizedPath)
  
  // Additional safety check: ensure normalized path doesn't contain traversal
  if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
    throw new Error('Invalid file path: path traversal detected after normalization')
  }
  
  // Resolve relative to allowed base directory
  const resolvedPath = resolve(allowedBaseDir, normalizedPath)
  
  // Security check: ensure resolved path is within allowed base directory
  // Use relative() to check if the resolved path is inside the base directory
  const relativePath = relative(allowedBaseDir, resolvedPath)
  if (relativePath.startsWith('..') || relativePath.includes('..')) {
    throw new Error('Invalid file path: resolved path outside allowed directory')
  }
  
  // Verify the file exists before attempting to read
  if (!existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`)
  }
  
  const fileStream = createReadStream(resolvedPath, { encoding: 'utf-8' })
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  })
  
  let header: string[] | null = null
  let rowCount = 0
  let validCount = 0
  let skippedCount = 0
  let batch: ZipCodeRow[] = []
  const BATCH_SIZE = 1000
  
  for await (const line of rl) {
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
      zip_code: zip,  // Use zip_code to match table column
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
    throw new Error(`Failed to insert ZIP codes: ${errorMessage}. Make sure migration 053_insert_zipcodes_rpc.sql has been applied.`)
  }
}

// Import from uploaded file content
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
      zip_code: zip,  // Use zip_code to match table column
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

export async function POST(request: NextRequest) {
  try {
    // Authentication removed for easier admin access
    // This is an admin-only tool, access should be restricted via deployment environment
    
    // Check for file upload (FormData) or file content (JSON)
    const contentType = request.headers.get('content-type') || ''
    
    // Try FormData first if content-type suggests it or if it's not JSON
    // IMPORTANT: Once we read formData or json, the body is consumed and can't be read again
    if (contentType.includes('multipart/form-data') || (!contentType.includes('application/json') && contentType !== '')) {
      try {
        const formData = await request.formData()
        const file = formData.get('file') as File | null
        
        if (file) {
          const fileContent = await file.text()
          const result = await importFromContent(fileContent)
          
          return NextResponse.json({
            success: true,
            ...result
          })
        } else {
          // No file in FormData
          return NextResponse.json({ error: 'No file provided in FormData' }, { status: 400 })
        }
      } catch (error: any) {
        // If FormData parsing fails, don't try to read JSON (body already consumed)
        console.error('[ZIP_IMPORT] FormData parsing error:', error.message)
        return NextResponse.json({ 
          error: 'Failed to parse FormData', 
          message: error.message || 'Invalid file upload format' 
        }, { status: 400 })
      }
    }
    
    // Handle JSON body (file content or file path) - only if not FormData
    try {
      const body = await request.json()
      
      if (body.fileContent) {
        // Direct file content
        const result = await importFromContent(body.fileContent)
        
        return NextResponse.json({
          success: true,
          ...result
        })
      } else if (body.filePath) {
        // Server-side file path (for local development)
        const result = await importFromPath(body.filePath)
        
        return NextResponse.json({
          success: true,
          ...result
        })
      } else {
        return NextResponse.json({ error: 'file, fileContent, or filePath is required' }, { status: 400 })
      }
    } catch (error: any) {
      console.error('[ZIP_IMPORT] JSON parsing error:', error.message)
      return NextResponse.json({ 
        error: 'Invalid request body', 
        message: 'Request must be FormData with file or JSON with fileContent/filePath' 
      }, { status: 400 })
    }
    
  } catch (error: any) {
    console.error('[ZIP_IMPORT] Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Import failed'
    }, { status: 500 })
  }
}

