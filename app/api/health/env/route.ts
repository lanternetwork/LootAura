import { NextResponse } from 'next/server'

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      status: 'healthy',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
