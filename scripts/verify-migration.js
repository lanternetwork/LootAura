#!/usr/bin/env node

/**
 * Migration verification script
 * Checks database schema and indexes for stabilization requirements
 */

const { createClient } = require('@supabase/supabase-js')

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables')
  console.error('   NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY required')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSchema() {
  console.log('🔍 Checking database schema...')
  
  try {
    // Check if items_v2 view exists and has category column
    const { data: columns, error } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_schema', 'public')
      .eq('table_name', 'items_v2')
      .in('column_name', ['category', 'categories'])
    
    if (error) {
      console.error('❌ Error checking schema:', error.message)
      return false
    }
    
    if (!columns || columns.length === 0) {
      console.error('❌ items_v2 view not found or no category columns')
      return false
    }
    
    const hasCategory = columns.some(col => col.column_name === 'category')
    const hasCategories = columns.some(col => col.column_name === 'categories')
    
    if (hasCategory && hasCategories) {
      console.error('❌ Both category and categories columns found - ambiguous')
      return false
    }
    
    if (!hasCategory && !hasCategories) {
      console.error('❌ No category columns found in items_v2')
      return false
    }
    
    const columnType = hasCategory ? 'single' : 'array'
    const columnName = hasCategory ? 'category' : 'categories'
    
    console.log(`✅ Found ${columnName} column (${columnType} type)`)
    
    return { columnType, columnName }
  } catch (error) {
    console.error('❌ Schema check failed:', error.message)
    return false
  }
}

async function checkIndexes(columnType, columnName) {
  console.log('🔍 Checking database indexes...')
  
  try {
    // Check for appropriate indexes
    const { data: indexes, error } = await supabase
      .from('pg_indexes')
      .select('indexname, indexdef')
      .eq('tablename', 'items_v2')
      .ilike('indexdef', `%${columnName}%`)
    
    if (error) {
      console.error('❌ Error checking indexes:', error.message)
      return false
    }
    
    if (!indexes || indexes.length === 0) {
      console.error(`❌ No indexes found for ${columnName} column`)
      return false
    }
    
    const expectedIndexType = columnType === 'single' ? 'btree' : 'gin'
    const hasCorrectIndex = indexes.some(idx => 
      idx.indexdef.toLowerCase().includes(expectedIndexType)
    )
    
    if (!hasCorrectIndex) {
      console.error(`❌ Missing ${expectedIndexType} index for ${columnName} column`)
      console.error('   Expected:', expectedIndexType)
      console.error('   Found indexes:', indexes.map(i => i.indexname).join(', '))
      return false
    }
    
    console.log(`✅ Found ${expectedIndexType} index for ${columnName} column`)
    return true
  } catch (error) {
    console.error('❌ Index check failed:', error.message)
    return false
  }
}

async function checkEnvironment() {
  console.log('🔍 Checking environment configuration...')
  
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_DEBUG'
  ]
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:')
    for (const varName of missingVars) {
      console.error(`   - ${varName}`)
    }
    return false
  }
  
  console.log('✅ All required environment variables present')
  
  // Mask sensitive values for logging
  const maskedUrl = supabaseUrl ? supabaseUrl.replace(/https:\/\/[^\.]+\.supabase\.co/, 'https://***.supabase.co') : 'undefined'
  console.log(`   Supabase URL: ${maskedUrl}`)
  console.log(`   Debug mode: ${process.env.NEXT_PUBLIC_DEBUG}`)
  
  return true
}

async function main() {
  console.log('🚀 Running migration verification...\n')
  
  const envCheck = await checkEnvironment()
  if (!envCheck) {
    process.exit(1)
  }
  
  const schemaResult = await checkSchema()
  if (!schemaResult) {
    process.exit(1)
  }
  
  const indexCheck = await checkIndexes(schemaResult.columnType, schemaResult.columnName)
  if (!indexCheck) {
    process.exit(1)
  }
  
  console.log('\n✅ Migration verification passed!')
  console.log(`   Schema: ${schemaResult.columnName} (${schemaResult.columnType})`)
  console.log('   Indexes: Appropriate index type found')
  console.log('   Environment: All required variables present')
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Verification failed:', error.message)
    process.exit(1)
  })
}

module.exports = { checkSchema, checkIndexes, checkEnvironment }
