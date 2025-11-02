#!/usr/bin/env tsx

/**
 * Import ZIP codes from CSV file into Supabase database
 * 
 * This script:
 * 1. Parses the georef-united-states-of-america-zc-point.csv file
 * 2. Extracts ZIP, city, state, lat, lng from the CSV
 * 3. Bulk imports into lootaura_v2.zipcodes table
 * 
 * Usage:
 *   tsx scripts/import-zipcodes.ts <path-to-csv-file>
 * 
 * Example:
 *   tsx scripts/import-zipcodes.ts "C:\Users\jw831\Downloads\zips\georef-united-states-of-america-zc-point.csv"
 */

import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import { adminSupabase } from '@/lib/supabase/admin'

interface ZipCodeRow {
  zip: string
  city: string | null
  state: string | null
  lat: number
  lng: number
}

interface CsvRow {
  'Zip Code': string
  'Official USPS city name': string
  'Official USPS State Code': string
  'Official State Name': string
  'Geo Point': string
  [key: string]: string
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

// Normalize ZIP code (remove leading zeros if needed, but keep as string)
function normalizeZip(zip: string): string | null {
  if (!zip || zip.trim() === '') {
    return null
  }
  
  // Remove non-numeric characters except for ZIP+4 extensions
  const cleaned = zip.trim().split('-')[0].replace(/\D/g, '')
  
  if (cleaned.length === 0 || cleaned.length > 5) {
    return null
  }
  
  // Pad with zeros to ensure 5 digits
  return cleaned.padStart(5, '0')
}

async function importZipCodes(csvFilePath: string) {
  console.log(`📂 Reading CSV file: ${csvFilePath}`)
  
  const fileStream = createReadStream(csvFilePath, { encoding: 'utf-8' })
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
  
  console.log('🔄 Processing CSV file...\n')
  
  for await (const line of rl) {
    const columns = parseCSVLine(line)
    
    if (!header) {
      header = columns
      console.log(`📋 Header columns: ${header.length}`)
      console.log(`   Sample: ${header.slice(0, 5).join(', ')}...\n`)
      continue
    }
    
    rowCount++
    
    // Create object from header and columns
    const row: CsvRow = {} as CsvRow
    header.forEach((col, idx) => {
      row[col] = columns[idx] || ''
    })
    
    // Extract data
    const rawZip = row['Zip Code']
    const city = row['Official USPS city name'] || null
    const state = row['Official USPS State Code'] || null
    const geoPoint = row['Geo Point'] || ''
    
    // Normalize ZIP
    const zip = normalizeZip(rawZip)
    if (!zip) {
      skippedCount++
      if (rowCount <= 10) {
        console.log(`⚠️  Skipped invalid ZIP: "${rawZip}"`)
      }
      continue
    }
    
    // Parse coordinates
    const coords = parseGeoPoint(geoPoint)
    if (!coords) {
      skippedCount++
      if (rowCount <= 10) {
        console.log(`⚠️  Skipped invalid Geo Point: "${geoPoint}" for ZIP ${zip}`)
      }
      continue
    }
    
    // Add to batch
    batch.push({
      zip,
      city: city || null,
      state: state || null,
      lat: coords.lat,
      lng: coords.lng
    })
    
    validCount++
    
    // Insert batch when full
    if (batch.length >= BATCH_SIZE) {
      await insertBatch(batch)
      batch = []
      
      if (rowCount % 5000 === 0) {
        console.log(`   Processed ${rowCount} rows, ${validCount} valid, ${skippedCount} skipped...`)
      }
    }
  }
  
  // Insert remaining batch
  if (batch.length > 0) {
    await insertBatch(batch)
  }
  
  console.log(`\n✅ Import complete!`)
  console.log(`   Total rows: ${rowCount}`)
  console.log(`   Valid ZIP codes: ${validCount}`)
  console.log(`   Skipped: ${skippedCount}`)
}

async function insertBatch(batch: ZipCodeRow[]) {
  try {
    // Note: Use full table name with schema prefix
    // Type assertion needed because placeholder client during build lacks schema types
    const client = adminSupabase as any
    const { error } = await client
      .from('lootaura_v2.zipcodes')
      .upsert(batch, {
        onConflict: 'zip',
        ignoreDuplicates: false
      })
    
    if (error) {
      console.error(`❌ Batch insert error:`, error.message)
      throw error
    }
  } catch (error: any) {
    console.error(`❌ Failed to insert batch:`, error.message)
    throw error
  }
}

// Main execution
async function main() {
  const csvFilePath = process.argv[2]
  
  if (!csvFilePath) {
    console.error('❌ Error: CSV file path required')
    console.log('\nUsage:')
    console.log('  tsx scripts/import-zipcodes.ts <path-to-csv-file>')
    console.log('\nExample:')
    console.log('  tsx scripts/import-zipcodes.ts "C:\\Users\\jw831\\Downloads\\zips\\georef-united-states-of-america-zc-point.csv"')
    process.exit(1)
  }
  
  try {
    await importZipCodes(csvFilePath)
    process.exit(0)
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()

