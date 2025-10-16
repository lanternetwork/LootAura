#!/usr/bin/env node

/**
 * Migration Verification Script
 * Verifies database schema changes are applied correctly
 */

const { createClient } = require('@supabase/supabase-js')

// Only run if SQL files changed
const changedFiles = process.env.CHANGED_FILES || ''
const hasSQLChanges = changedFiles.includes('.sql') || process.env.FORCE_MIGRATION_CHECK === 'true'

if (!hasSQLChanges) {
  console.log('ℹ️  No SQL file changes detected, skipping migration verification')
  process.exit(0)
}

async function verifyMigration() {
  console.log('🔍 Verifying database migration...')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing required environment variables')
    console.error('   NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY required')
    process.exit(1)
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  try {
    // Check if public.items_v2 exists and has category column
    const { data: columns, error } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'items_v2')
      .in('column_name', ['category', 'categories'])
    
    if (error) {
      console.error('❌ Failed to query schema:', error.message)
      process.exit(1)
    }
    
    if (!columns || columns.length === 0) {
      console.error('❌ public.items_v2 table not found or missing category columns')
      process.exit(1)
    }
    
    console.log('✅ Schema verification passed:')
    columns.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`)
    })
    
    // Check for appropriate indexes
    const { data: indexes, error: indexError } = await supabase
      .from('information_schema.statistics')
      .select('index_name, column_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'items_v2')
      .in('column_name', ['category', 'categories'])
    
    if (!indexError && indexes && indexes.length > 0) {
      console.log('✅ Indexes found:')
      indexes.forEach(idx => {
        console.log(`   - ${idx.index_name} on ${idx.column_name}`)
      })
    } else {
      console.log('⚠️  No indexes found on category columns (performance may be impacted)')
    }
    
    console.log('✅ Migration verification completed')
    
  } catch (error) {
    console.error('❌ Migration verification failed:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  verifyMigration()
}

module.exports = { verifyMigration }
