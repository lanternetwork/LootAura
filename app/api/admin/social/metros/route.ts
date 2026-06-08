import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import {
  buildSocialMetroOptions,
} from '@/lib/admin/social/buildSocialCityReport'
import { discoverSeoMetrosFromPublishedSales } from '@/lib/seo/metroCatalog'

export const dynamic = 'force-dynamic'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

/** Metro catalog for admin social city selector. */
export async function GET(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  try {
    const metros = await discoverSeoMetrosFromPublishedSales()
    return NextResponse.json({
      ok: true,
      metros: buildSocialMetroOptions(metros),
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Metro catalog fetch failed'
    return jsonError(500, 'SOCIAL_METROS_FAILED', message)
  }
}
