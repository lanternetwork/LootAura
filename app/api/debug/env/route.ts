import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  return NextResponse.json({
    ok: true,
    status: 'debug_env_access_granted',
    timestamp: new Date().toISOString(),
  })
}
