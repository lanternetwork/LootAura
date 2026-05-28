import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { runSeoCrawlSmokeChecks } from '@/lib/seo/crawlSmoke'

export const dynamic = 'force-dynamic'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

/**
 * Phase 5B — admin crawl smoke against live/staging HTML.
 * GET /api/admin/seo/crawl-smoke?metroSlug=dallas-tx&saleId=...
 */
export async function GET(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  const { searchParams } = request.nextUrl
  const metroSlug = searchParams.get('metroSlug') ?? undefined
  const sampleSaleId = searchParams.get('saleId') ?? undefined
  const baseUrl = searchParams.get('baseUrl') ?? undefined

  try {
    const report = await runSeoCrawlSmokeChecks({ metroSlug, sampleSaleId, baseUrl })
    return NextResponse.json({ ok: true, report })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Crawl smoke failed'
    return jsonError(500, 'CRAWL_SMOKE_FAILED', message)
  }
}
