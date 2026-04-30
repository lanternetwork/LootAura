import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { getGeocodeQueueMetrics } from '@/lib/ingestion/geocodeQueue'

export const dynamic = 'force-dynamic'

async function handler(request: NextRequest): Promise<NextResponse> {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) return error
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  const metrics = await getGeocodeQueueMetrics()
  return NextResponse.json(metrics)
}

export const GET = withRateLimit(handler, [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY])
