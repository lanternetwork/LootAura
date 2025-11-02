#!/usr/bin/env tsx

/**
 * Generate hardcoded ZIP code list from database
 * 
 * This script:
 * 1. Queries the database for ZIP codes (optionally filtered by usage/city)
 * 2. Generates a TypeScript object with the most popular ZIPs
 * 3. Outputs the code to update the hardcoded list in the ZIP geocoding route
 * 
 * Usage:
 *   tsx scripts/generate-hardcoded-zips.ts [options]
 * 
 * Options:
 *   --limit <number>    Maximum number of ZIPs to include (default: 500)
 *   --min-population    Filter by minimum population (if available)
 *   --output <file>     Output to file instead of stdout
 */

import { adminSupabase } from '@/lib/supabase/admin'

interface ZipCode {
  zip: string
  city: string | null
  state: string | null
  lat: number
  lng: number
}

interface HardcodedZip {
  zip: string
  lat: number
  lng: number
  city: string
  state: string
}

async function generateHardcodedList(limit: number = 500, outputFile?: string) {
  console.log(`🔍 Querying database for ${limit} ZIP codes...\n`)
  
  try {
    // Query ZIP codes ordered by city/state (prioritize populated areas)
    // You could also order by usage if you track that
    // Type assertion needed because placeholder client during build lacks schema types
    const client = adminSupabase as any
    const { data, error } = await client
      .from('lootaura_v2.zipcodes')
      .select('zip, city, state, lat, lng')
      .not('city', 'is', null)
      .not('state', 'is', null)
      .order('zip', { ascending: true })
      .limit(limit)
    
    if (error) {
      throw error
    }
    
    if (!data || data.length === 0) {
      console.log('⚠️  No ZIP codes found in database')
      return
    }
    
    console.log(`✅ Found ${data.length} ZIP codes`)
    console.log(`📝 Generating hardcoded list...\n`)
    
    // Transform to hardcoded format
    // Type assertion needed because data type is inferred as never during build
    const typedData = (data || []) as Array<{ zip: string; city: string; state: string; lat: number; lng: number }>
    const hardcoded: HardcodedZip[] = typedData
      .filter((zip): zip is ZipCode => 
        zip.zip != null && 
        zip.city != null && 
        zip.state != null &&
        zip.lat != null &&
        zip.lng != null
      )
      .map(zip => ({
        zip: zip.zip,
        lat: zip.lat,
        lng: zip.lng,
        city: zip.city!,
        state: zip.state!
      }))
    
    // Group by city/state for better organization
    const grouped: Record<string, HardcodedZip[]> = {}
    hardcoded.forEach(zip => {
      const key = `${zip.city}, ${zip.state}`
      if (!grouped[key]) {
        grouped[key] = []
      }
      grouped[key].push(zip)
    })
    
    // Generate TypeScript code
    let code = `// Hardcoded ZIP codes (generated from database)\n`
    code += `// Total: ${hardcoded.length} ZIP codes\n`
    code += `// Generated: ${new Date().toISOString()}\n\n`
    code += `const hardcodedZips: Record<string, { lat: number; lng: number; city: string; state: string }> = {\n`
    
    // Sort groups by city name
    const sortedGroups = Object.keys(grouped).sort()
    
    for (const cityState of sortedGroups) {
      const zips = grouped[cityState]
      
      // Add comment for city group
      code += `\n  // ${cityState}\n`
      
      // Add each ZIP code
      zips.forEach(zip => {
        code += `  '${zip.zip}': { lat: ${zip.lat}, lng: ${zip.lng}, city: '${escapeString(zip.city)}', state: '${zip.state}' },\n`
      })
    }
    
    code += `}\n`
    
    // Output to file or stdout
    if (outputFile) {
      const fs = await import('fs/promises')
      await fs.writeFile(outputFile, code, 'utf-8')
      console.log(`✅ Hardcoded list written to: ${outputFile}`)
      console.log(`   Total ZIP codes: ${hardcoded.length}`)
      console.log(`   Cities: ${sortedGroups.length}`)
    } else {
      console.log(code)
      console.log(`\n✅ Generated ${hardcoded.length} ZIP codes`)
      console.log(`   Cities: ${sortedGroups.length}`)
    }
    
  } catch (error: any) {
    console.error(`❌ Error generating hardcoded list:`, error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

function escapeString(str: string): string {
  return str.replace(/'/g, "\\'")
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  let limit = 500
  let outputFile: string | undefined
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10)
      if (isNaN(limit) || limit <= 0) {
        console.error('❌ Error: --limit must be a positive number')
        process.exit(1)
      }
      i++
    } else if (args[i] === '--output' && args[i + 1]) {
      outputFile = args[i + 1]
      i++
    }
  }
  
  return { limit, outputFile }
}

// Main execution
async function main() {
  const { limit, outputFile } = parseArgs()
  
  await generateHardcodedList(limit, outputFile)
  process.exit(0)
}

main()

