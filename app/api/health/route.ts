import { NextResponse } from 'next/server'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000'

    const healthChecks = [
      { name: 'env', url: `${baseUrl}/api/health/env` },
      { name: 'db', url: `${baseUrl}/api/health/db` },
      { name: 'schema', url: `${baseUrl}/api/health/schema` },
      { name: 'postgis', url: `${baseUrl}/api/health/postgis` },
      { name: 'auth', url: `${baseUrl}/api/health/auth` }
    ]

    const results = await Promise.allSettled(
      healthChecks.map(async (check) => {
        try {
          const response = await fetch(check.url)
          const data = await response.json()
          return {
            name: check.name,
            ok: response.ok && data.ok,
            status: response.status,
            data: data
          }
        } catch (error) {
          return {
            name: check.name,
            ok: false,
            status: 500,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      })
    )

    const healthStatus = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        const { name: _ignored, ...rest } = result.value as any
        return { name: healthChecks[index].name, ...rest }
      }
      return {
        name: healthChecks[index].name,
        ok: false,
        error: result.status === 'rejected' ? (result as any).reason : 'Unknown error'
      }
    })

    const overallOk = healthStatus.every(check => check.ok)

    return NextResponse.json({
      ok: overallOk,
      status: overallOk ? 'healthy' : 'unhealthy',
      checks: healthStatus,
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA || 'local'
    }, { 
      status: overallOk ? 200 : 503 
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown health check error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}