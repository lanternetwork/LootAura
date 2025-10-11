#!/usr/bin/env node

// Use global fetch (available in Node 18+)

const BASE_URL = 'http://localhost:3000'
const LOUISVILLE_CENTER = { lat: 38.24, lng: -85.75 }

interface ApiResponse {
  ok: boolean
  data?: any[]
  count?: number
  distanceKm?: number
  error?: string
  code?: string
  details?: string
  relation?: string
}

async function smokeTestEndpoint(url: string, name: string): Promise<void> {
  console.log(`\n🔍 Testing ${name}`)
  console.log(`📡 URL: ${url}`)
  
  try {
    const response = await fetch(url)
    
    // Assert HTTP 200
    if (response.status !== 200) {
      console.error(`❌ HTTP ${response.status} - Expected 200`)
      const text = await response.text()
      console.error(`Response body: ${text}`)
      process.exit(1)
    }
    
    console.log(`✅ HTTP ${response.status}`)
    
    // Parse JSON
    const json: ApiResponse = await response.json()
    
    // Check if API returned error
    if (json.ok === false) {
      console.error(`❌ API Error Response:`)
      console.error(`   Error: ${json.error}`)
      console.error(`   Code: ${json.code}`)
      console.error(`   Details: ${json.details}`)
      console.error(`   Relation: ${json.relation}`)
      console.error(`   Full JSON:`, JSON.stringify(json, null, 2))
      process.exit(1)
    }
    
    // Assert ok === true
    if (json.ok !== true) {
      console.error(`❌ Expected ok: true, got: ${json.ok}`)
      console.error(`   Full JSON:`, JSON.stringify(json, null, 2))
      process.exit(1)
    }
    
    console.log(`✅ API Response OK`)
    
    // Log response details
    console.log(`📊 Count: ${json.count || 'N/A'}`)
    console.log(`📏 Distance: ${json.distanceKm || 'N/A'} km`)
    console.log(`📦 Data length: ${json.data?.length || 0}`)
    
    // Assert data exists and has content
    if (!json.data || json.data.length === 0) {
      console.error(`❌ Expected data array with length >= 1, got: ${json.data?.length || 0}`)
      console.error(`   Full JSON:`, JSON.stringify(json, null, 2))
      process.exit(1)
    }
    
    console.log(`✅ Data array has ${json.data.length} items`)
    
  } catch (error) {
    console.error(`❌ Network/Fetch Error:`, error)
    process.exit(1)
  }
}

async function main() {
  console.log('🚀 Starting Sales API Smoke Tests')
  console.log(`🎯 Target: ${BASE_URL}`)
  console.log(`📍 Louisville Center: ${LOUISVILLE_CENTER.lat}, ${LOUISVILLE_CENTER.lng}`)
  
  // Test 1: /api/sales endpoint
  const salesUrl = `${BASE_URL}/api/sales?lat=${LOUISVILLE_CENTER.lat}&lng=${LOUISVILLE_CENTER.lng}&distanceKm=40&limit=24&offset=0`
  await smokeTestEndpoint(salesUrl, 'Sales API')
  
  // Test 2: /api/sales/markers endpoint
  const markersUrl = `${BASE_URL}/api/sales/markers?lat=${LOUISVILLE_CENTER.lat}&lng=${LOUISVILLE_CENTER.lng}&distanceKm=40&limit=1000`
  await smokeTestEndpoint(markersUrl, 'Markers API')
  
  console.log('\n🎉 All smoke tests passed!')
  console.log('✅ Both endpoints returned 200')
  console.log('✅ Both responses have ok: true')
  console.log('✅ Both responses have data with length >= 1')
}

// Run the smoke tests
main().catch((error) => {
  console.error('💥 Smoke test failed:', error)
  process.exit(1)
})
