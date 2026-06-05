import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { formatSeoDiagnosticsText } from '@/lib/seo/buildSeoOperationsDashboard'
import { SeoOperationalGateUnavailableError } from '@/lib/seo/loadSeoIndexAllowlistForAdmin'
import { loadSeoOperationsDashboard } from '@/lib/seo/loadSeoOperationsDashboard'

export const dynamic = 'force-dynamic'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

/**
 * GET /api/admin/seo/operations-dashboard
 * Read-only SEO operations snapshot for /admin/seo.
 * ?crawlSmoke=1 runs live crawl smoke checks (on demand).
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

  const runCrawlSmoke =
    request.nextUrl.searchParams.get('crawlSmoke') === '1' ||
    request.nextUrl.searchParams.get('crawlSmoke') === 'true'

  try {
    const dashboard = await loadSeoOperationsDashboard(request, { runCrawlSmoke })
    return NextResponse.json({
      ok: true,
      dashboard,
      diagnosticsText: formatSeoDiagnosticsText(dashboard),
    })
  } catch (error) {
    if (error instanceof SeoOperationalGateUnavailableError) {
      return jsonError(503, 'SEO_OPS_GATE_UNAVAILABLE', error.message)
    }
    const message = error instanceof Error ? error.message : 'SEO operations dashboard failed'
    return jsonError(500, 'SEO_OPS_DASHBOARD_FAILED', message)
  }
}
