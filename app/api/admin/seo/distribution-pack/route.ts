import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { buildMetroDistributionPack } from '@/lib/seo/distribution/buildMetroDistributionPack'
import { getDistributionSurface, isWeekendDistributionSurface } from '@/lib/seo/distribution/surfaces'
import type { SeoDistributionSurfaceId } from '@/lib/seo/distribution/types'
import { fetchMetroInventory } from '@/lib/seo/fetchMetroInventory'
import { fetchMetroWeekendInventory } from '@/lib/seo/fetchMetroWeekendInventory'
import { discoverSeoMetrosFromPublishedSales, getSeoMetroBySlug } from '@/lib/seo/metroCatalog'
import {
  loadSeoIndexAllowlistForAdmin,
  resolveSeoNationalIndexingAllowed,
  SeoOperationalGateUnavailableError,
} from '@/lib/seo/loadSeoIndexAllowlistForAdmin'

export const dynamic = 'force-dynamic'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

/**
 * Phase 7 — human-reviewed local discovery copy packs (no automated posting).
 * GET /api/admin/seo/distribution-pack?metroSlug=dallas-tx&surface=reddit_weekend
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
  const metroSlug = searchParams.get('metroSlug')?.trim()
  const surface = searchParams.get('surface')?.trim() as SeoDistributionSurfaceId | undefined

  if (searchParams.has('nationalIndexingAllowed')) {
    return jsonError(
      400,
      'INVALID_REQUEST',
      'nationalIndexingAllowed is not accepted — eligibility is derived server-side'
    )
  }

  if (!metroSlug) {
    return jsonError(400, 'INVALID_REQUEST', 'metroSlug is required')
  }
  if (!surface || !getDistributionSurface(surface)) {
    return jsonError(400, 'INVALID_REQUEST', 'surface must be a supported distribution channel')
  }

  const metros = await discoverSeoMetrosFromPublishedSales()
  const metro = getSeoMetroBySlug(metros, metroSlug)
  if (!metro) {
    return jsonError(404, 'METRO_NOT_FOUND', 'Unknown metro slug (no published inventory footprint)')
  }

  let nationalIndexingAllowed: boolean
  try {
    const allowlist = await loadSeoIndexAllowlistForAdmin(request)
    nationalIndexingAllowed = resolveSeoNationalIndexingAllowed(allowlist)
  } catch (error) {
    if (error instanceof SeoOperationalGateUnavailableError) {
      return jsonError(503, 'OPERATIONAL_GATES_UNAVAILABLE', error.message)
    }
    throw error
  }

  try {
    if (isWeekendDistributionSurface(surface)) {
      const { sales, summary, weekend } = await fetchMetroWeekendInventory(metro)
      const pack = buildMetroDistributionPack({
        metro,
        surface,
        inventory: summary,
        nationalIndexingAllowed,
        weekend,
        sampleSales: sales,
      })
      return NextResponse.json({ ok: true, pack })
    }

    const { sales, summary } = await fetchMetroInventory(metro, { limit: 10 })
    const pack = buildMetroDistributionPack({
      metro,
      surface,
      inventory: summary,
      nationalIndexingAllowed,
      sampleSales: sales,
    })
    return NextResponse.json({ ok: true, pack })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Distribution pack failed'
    return jsonError(500, 'DISTRIBUTION_PACK_FAILED', message)
  }
}
