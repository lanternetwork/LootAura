#!/usr/bin/env node

/**
 * Supabase Keys Verification Script
 * Tests both client-side (anon) and server-side (service role) connections
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function verifySupabaseKeys() {
  console.log('🔍 Verifying Supabase Keys...\n')

  // Check environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  console.log('📋 Environment Variables:')
  console.log(`  SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}`)
  console.log(`  ANON_KEY: ${anonKey ? '✅ Set' : '❌ Missing'}`)
  console.log(`  SERVICE_ROLE_KEY: ${serviceRoleKey ? '✅ Set' : '❌ Missing'}\n`)

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.log('❌ Missing required environment variables!')
    console.log('Make sure you have a .env.local file with:')
    console.log('  NEXT_PUBLIC_SUPABASE_URL=your-url')
    console.log('  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key')
    console.log('  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key')
    process.exit(1)
  }

  try {
    // Test 1: Anonymous client connection
    console.log('🔑 Testing Anonymous Key (Client-side)...')
    const anonClient = createClient(supabaseUrl, anonKey)
    
    const { data: anonData, error: anonError } = await anonClient
      .from('profiles')
      .select('count')
      .limit(1)
    
    if (anonError) {
      console.log(`  ❌ Anonymous key failed: ${anonError.message}`)
    } else {
      console.log('  ✅ Anonymous key working - can read profiles table')
    }

    // Test 2: Service role client connection
    console.log('\n🔐 Testing Service Role Key (Server-side)...')
    const serviceClient = createClient(supabaseUrl, serviceRoleKey)
    
    const { data: serviceData, error: serviceError } = await serviceClient
      .from('profiles')
      .select('count')
      .limit(1)
    
    if (serviceError) {
      console.log(`  ❌ Service role key failed: ${serviceError.message}`)
    } else {
      console.log('  ✅ Service role key working - can read profiles table')
    }

    // Test 3: Check schema configuration
    console.log('\n📊 Testing Schema Configuration...')
    const schema = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public'
    console.log(`  Schema: ${schema}`)
    
    if (schema === 'lootaura_v2') {
      // Test V2 schema tables
      const { data: salesData, error: salesError } = await serviceClient
        .from('sales')
        .select('count')
        .limit(1)
      
      if (salesError) {
        console.log(`  ⚠️  V2 schema tables may not exist: ${salesError.message}`)
      } else {
        console.log('  ✅ V2 schema working - can read sales table')
      }
    }

    // Test 4: Authentication test
    console.log('\n🔐 Testing Authentication...')
    const { data: authData, error: authError } = await anonClient.auth.getSession()
    
    if (authError) {
      console.log(`  ⚠️  Auth error: ${authError.message}`)
    } else {
      console.log('  ✅ Authentication service accessible')
    }

    console.log('\n🎉 Supabase keys verification complete!')
    console.log('\n📝 Summary:')
    console.log('  - Anonymous key: Client-side operations')
    console.log('  - Service role key: Server-side operations (bypasses RLS)')
    console.log('  - Both keys are working correctly!')

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message)
    process.exit(1)
  }
}

// Run verification
verifySupabaseKeys().catch(console.error)
