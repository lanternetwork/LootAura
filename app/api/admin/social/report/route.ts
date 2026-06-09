import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import {
  buildSocialCityReport,
  SocialCityReportError,
} from '@/lib/admin/social/buildSocialCityReport'
import { isSocialReportFormatSlug } from '@/lib/admin/social/socialReportFormats'

export const dynamic = 'force-dynamic'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

/** Live weekend city report for admin social screenshot workflow. */
export async function GET(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  const citySlug = request.nextUrl.searchParams.get('citySlug')?.trim().toLowerCase() ?? ''
  if (!citySlug) {
    return jsonError(400, 'CITY_SLUG_REQUIRED', 'citySlug query parameter is required')
  }

  const formatParam = request.nextUrl.searchParams.get('format')?.trim().toLowerCase() ?? ''
  if (!formatParam || !isSocialReportFormatSlug(formatParam)) {
    return jsonError(
      400,
      'FORMAT_REQUIRED',
      'format query parameter is required (instagram-feed or vertical-story)'
    )
  }

  try {
    const report = await buildSocialCityReport(citySlug, formatParam)
    return NextResponse.json({ ok: true, report })
  } catch (error) {
    if (error instanceof SocialCityReportError) {
      return jsonError(error.status, error.code, error.message)
    }
    const message = error instanceof Error ? error.message : 'Social city report failed'
    return jsonError(500, 'SOCIAL_REPORT_FAILED', message)
  }
}
