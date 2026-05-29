import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import {
  fetchSeoRolloutState,
  setSeoRolloutAttestation,
  type SeoRolloutAttestationTarget,
} from '@/lib/seo/seoRolloutState'

export const dynamic = 'force-dynamic'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

function serializeRolloutState(state: Awaited<ReturnType<typeof fetchSeoRolloutState>>) {
  return {
    publicIndexingEnabled: state.publicIndexingEnabled,
    publicIndexingEnabledAt: state.publicIndexingEnabledAt,
    publicIndexingDisabledAt: state.publicIndexingDisabledAt,
    crawlValidationPassed: state.crawlValidationPassed,
    crawlValidationPassedAt: state.crawlValidationPassedAt,
    searchConsoleValidationPassed: state.searchConsoleValidationPassed,
    searchConsoleValidationPassedAt: state.searchConsoleValidationPassedAt,
  }
}

function parseTarget(value: unknown): SeoRolloutAttestationTarget | null {
  if (
    value === 'public_indexing' ||
    value === 'crawl_validation' ||
    value === 'search_console'
  ) {
    return value
  }
  return null
}

/**
 * GET /api/admin/seo/rollout-state — read SEO rollout attestations (DB-backed).
 * POST /api/admin/seo/rollout-state — { target, enabled }
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

  try {
    const state = await fetchSeoRolloutState(getAdminDb())
    return NextResponse.json({ ok: true, rolloutState: serializeRolloutState(state) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonError(500, 'SEO_ROLLOUT_READ_FAILED', message)
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  let body: { target?: unknown; enabled?: boolean }
  try {
    body = (await request.json()) as { target?: unknown; enabled?: boolean }
  } catch {
    return jsonError(
      400,
      'INVALID_BODY',
      'Expected JSON body { "target": "public_indexing" | "crawl_validation" | "search_console", "enabled": boolean }'
    )
  }

  const target = parseTarget(body.target)
  if (!target) {
    return jsonError(400, 'INVALID_BODY', 'Field "target" is required and must be a known attestation')
  }
  if (typeof body.enabled !== 'boolean') {
    return jsonError(400, 'INVALID_BODY', 'Field "enabled" must be a boolean')
  }

  try {
    const state = await setSeoRolloutAttestation(getAdminDb(), { target, enabled: body.enabled })
    logger.info('SEO rollout attestation updated from admin', {
      component: 'api/admin/seo/rollout-state',
      target,
      enabled: body.enabled,
    })
    return NextResponse.json({ ok: true, rolloutState: serializeRolloutState(state) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonError(500, 'SEO_ROLLOUT_WRITE_FAILED', message)
  }
}
