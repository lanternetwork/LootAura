import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json({
        status: 'error',
        message: 'Missing Supabase environment variables',
        details: {
          url: !!supabaseUrl,
          anonKey: !!anonKey,
          serviceRole: !!serviceRoleKey
        }
      }, { status: 500 })
    }

    // Test anonymous client (use profiles_v2 view, not base table)
    // Anon should not have SELECT on base lootaura_v2.profiles table
    const anonClient = createClient(supabaseUrl, anonKey)
    const { error: anonError } = await anonClient
      .from('profiles_v2')
      .select('count')
      .limit(1)

    // Test service role client
    const serviceClient = createClient(supabaseUrl, serviceRoleKey)
    const { error: serviceError } = await serviceClient
      .from('profiles')
      .select('count')
      .limit(1)

    // Test schema
    const schema = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public'
    let schemaTest = null
    if (schema === 'lootaura_v2') {
      const { data: _salesData, error: salesError } = await serviceClient
        .from('sales')
        .select('count')
        .limit(1)
      schemaTest = { success: !salesError, error: salesError?.message }
    }

    return NextResponse.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      tests: {
        anonymous: {
          success: !anonError,
          error: anonError?.message
        },
        serviceRole: {
          success: !serviceError,
          error: serviceError?.message
        },
        schema: {
          name: schema,
          test: schemaTest
        }
      },
      environment: {
        url: supabaseUrl,
        schema: schema,
        hasAnonKey: !!anonKey,
        hasServiceRole: !!serviceRoleKey
      }
    })

  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      message: 'Supabase health check failed',
      error: error.message
    }, { status: 500 })
  }
}
