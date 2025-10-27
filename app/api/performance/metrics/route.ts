import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/auth/server-session'
import { cookies } from 'next/headers'
import { authDebug } from '@/lib/debug/authDebug'

export const dynamic = 'force-dynamic'

interface PerformanceMetrics {
  database: {
    connectionPool: number
    queryTime: number
    slowQueries: number
    indexUsage: any[]
  }
  api: {
    responseTime: number
    errorRate: number
    throughput: number
  }
  memory: {
    heapUsed: number
    heapTotal: number
    external: number
  }
  timestamp: string
}

export async function GET(_request: NextRequest) {
  try {
    // Only allow in debug mode or for authenticated admin users
    const isDebugMode = process.env.NEXT_PUBLIC_DEBUG === 'true'
    
    if (!isDebugMode) {
      const cookieStore = cookies()
      const supabase = createServerSupabaseClient(cookieStore)
      
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      
      // Check if user is admin (you would implement this check)
      // For now, we'll allow all authenticated users in non-debug mode
    }

    const startTime = Date.now()

    // Get database performance metrics
    const dbMetrics = await getDatabaseMetrics()
    
    // Get API performance metrics
    const apiMetrics = await getApiMetrics()
    
    // Get memory metrics
    const memoryMetrics = await getMemoryMetrics()

    const metrics: PerformanceMetrics = {
      database: dbMetrics,
      api: apiMetrics,
      memory: memoryMetrics,
      timestamp: new Date().toISOString()
    }

    const responseTime = Date.now() - startTime
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      authDebug.logPerformance('performance-metrics', startTime)
    }

    return NextResponse.json({
      metrics,
      responseTime,
      status: 'success'
    })

  } catch (error) {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      authDebug.logAuthError('performance-metrics', error)
    }

    return NextResponse.json(
      { error: 'Failed to fetch performance metrics' },
      { status: 500 }
    )
  }
}

async function getDatabaseMetrics() {
  try {
    const cookieStore = cookies()
    const supabase = createServerSupabaseClient(cookieStore)

    // Get query performance stats
    const { data: queryStats, error: _queryError } = await supabase
      .rpc('get_query_performance_stats')

    // Get index usage stats
    const { data: indexStats, error: _indexError } = await supabase
      .rpc('get_index_usage_stats')

    // Get connection pool info (simplified)
    const { data: connectionInfo, error: _connectionError } = await supabase
      .from('pg_stat_activity')
      .select('count(*)')
      .limit(1)

    return {
      connectionPool: (connectionInfo as any)?.[0]?.count || 0,
      queryTime: (queryStats as any)?.[0]?.avg_execution_time_ms || 0,
      slowQueries: (queryStats as any)?.filter((q: any) => q.avg_execution_time_ms > 1000).length || 0,
      indexUsage: indexStats || []
    }
  } catch (error: any) {
    return {
      connectionPool: 0,
      queryTime: 0,
      slowQueries: 0,
      indexUsage: []
    }
  }
}

async function getApiMetrics() {
  // This would typically come from your API monitoring system
  // For now, we'll return mock data
  return {
    responseTime: 150, // Average response time in ms
    errorRate: 0.02, // 2% error rate
    throughput: 100 // Requests per minute
  }
}

async function getMemoryMetrics() {
  // Get memory usage from process
  const memUsage = process.memoryUsage()
  
  return {
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
    external: Math.round(memUsage.external / 1024 / 1024) // MB
  }
}

