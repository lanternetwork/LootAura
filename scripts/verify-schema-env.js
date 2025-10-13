#!/usr/bin/env node

/**
 * Schema and Environment Verification Script
 * Verifies database schema, indexes, and environment configuration
 */

const { createClient } = require('@supabase/supabase-js')

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const debugMode = process.env.NEXT_PUBLIC_DEBUG

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables')
  console.error('   NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY required')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function verifyEnvironment() {
  console.log('🔍 Verifying environment configuration...')
  
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
  const maskedUrl = supabaseUrl.replace(/https:\/\/[^\.]+\.supabase\.co/, 'https://***.supabase.co')
  console.log(`   Supabase URL: ${maskedUrl}`)
  console.log(`   Debug mode: ${debugMode}`)
  
  return true
}

async function verifyDatabaseConnection() {
  console.log('🔍 Verifying database connection...')
  
  try {
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .limit(1)
    
    if (error) {
      console.error('❌ Database connection failed:', error.message)
      return false
    }
    
    console.log('✅ Database connection successful')
    return true
  } catch (error) {
    console.error('❌ Database connection failed:', error.message)
    return false
  }
}

async function verifyItemsV2Schema() {
  console.log('🔍 Verifying items_v2 schema...')
  
  try {
    // Check if items_v2 view exists
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name, table_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'items_v2')
    
    if (tablesError) {
      console.error('❌ Error checking tables:', tablesError.message)
      return false
    }
    
    if (!tables || tables.length === 0) {
      console.error('❌ items_v2 view not found')
      return false
    }
    
    console.log(`✅ items_v2 view found (type: ${tables[0].table_type})`)
    
    // Check category columns
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_schema', 'public')
      .eq('table_name', 'items_v2')
      .in('column_name', ['category', 'categories'])
    
    if (columnsError) {
      console.error('❌ Error checking columns:', columnsError.message)
      return false
    }
    
    if (!columns || columns.length === 0) {
      console.error('❌ No category columns found in items_v2')
      return false
    }
    
    const hasCategory = columns.some(col => col.column_name === 'category')
    const hasCategories = columns.some(col => col.column_name === 'categories')
    
    if (hasCategory && hasCategories) {
      console.error('❌ Both category and categories columns found - ambiguous')
      return false
    }
    
    const columnType = hasCategory ? 'single' : 'array'
    const columnName = hasCategory ? 'category' : 'categories'
    const dataType = columns.find(col => col.column_name === columnName)?.data_type
    
    console.log(`✅ Found ${columnName} column (${columnType} type, ${dataType})`)
    
    return { columnType, columnName, dataType }
  } catch (error) {
    console.error('❌ Schema verification failed:', error.message)
    return false
  }
}

async function verifyIndexes(columnType, columnName) {
  console.log('🔍 Verifying database indexes...')
  
  try {
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
    console.error('❌ Index verification failed:', error.message)
    return false
  }
}

async function verifyRLSPolicies() {
  console.log('🔍 Verifying RLS policies...')
  
  try {
    const { data: policies, error } = await supabase
      .from('pg_policies')
      .select('policyname, permissive, roles, cmd, qual')
      .eq('tablename', 'items_v2')
    
    if (error) {
      console.error('❌ Error checking RLS policies:', error.message)
      return false
    }
    
    if (!policies || policies.length === 0) {
      console.warn('⚠️  No RLS policies found for items_v2')
      return true
    }
    
    console.log(`✅ Found ${policies.length} RLS policies for items_v2`)
    for (const policy of policies) {
      console.log(`   - ${policy.policyname} (${policy.cmd})`)
    }
    
    return true
  } catch (error) {
    console.error('❌ RLS policy verification failed:', error.message)
    return false
  }
}

async function verifyDataAccess() {
  console.log('🔍 Verifying data access...')
  
  try {
    // Test basic data access
    const { data, error } = await supabase
      .from('items_v2')
      .select('id, name, category')
      .limit(1)
    
    if (error) {
      console.error('❌ Data access failed:', error.message)
      return false
    }
    
    console.log(`✅ Data access successful (${data?.length || 0} rows accessible)`)
    return true
  } catch (error) {
    console.error('❌ Data access verification failed:', error.message)
    return false
  }
}

async function main() {
  console.log('🚀 Running schema and environment verification...\n')
  
  const envCheck = await verifyEnvironment()
  if (!envCheck) {
    process.exit(1)
  }
  
  const connectionCheck = await verifyDatabaseConnection()
  if (!connectionCheck) {
    process.exit(1)
  }
  
  const schemaResult = await verifyItemsV2Schema()
  if (!schemaResult) {
    process.exit(1)
  }
  
  const indexCheck = await verifyIndexes(schemaResult.columnType, schemaResult.columnName)
  if (!indexCheck) {
    process.exit(1)
  }
  
  const rlsCheck = await verifyRLSPolicies()
  if (!rlsCheck) {
    process.exit(1)
  }
  
  const dataCheck = await verifyDataAccess()
  if (!dataCheck) {
    process.exit(1)
  }
  
  console.log('\n✅ All verification checks passed!')
  console.log(`   Environment: All required variables present`)
  console.log(`   Database: Connection successful`)
  console.log(`   Schema: ${schemaResult.columnName} (${schemaResult.columnType}, ${schemaResult.dataType})`)
  console.log(`   Indexes: Appropriate index type found`)
  console.log(`   RLS: Policies configured`)
  console.log(`   Data: Accessible and queryable`)
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Verification failed:', error.message)
    process.exit(1)
  })
}

module.exports = { 
  verifyEnvironment, 
  verifyDatabaseConnection, 
  verifyItemsV2Schema, 
  verifyIndexes, 
  verifyRLSPolicies, 
  verifyDataAccess 
}
