import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import {
  fetchEsnetBootstrapState,
  fetchEsnetIngestState,
  setEsnetBootstrapEnabled,
  setEsnetIngestEnabled,
  type EsnetProviderRuntimeState,
} from '@/lib/ingestion/estatesalesnet/esnetOrchestrationState'
import {
  fetchCoverageBootstrapState,
  setCoverageBootstrapEnabled,
  type CoverageBootstrapDisabledReason,
} from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

/** `nationwide` = YSTM coverage bootstrap; ES.net uses `ingest` | `bootstrap`. */
export type ProviderRuntimeTarget = 'nationwide' | 'ingest' | 'bootstrap'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

function parseTarget(value: unknown): ProviderRuntimeTarget | null {
  if (value === 'nationwide' || value === 'ingest' || value === 'bootstrap') return value
  /** @deprecated Use `ingest` or `bootstrap` instead of `estatesales_net`. */
  if (value === 'estatesales_net') return 'bootstrap'
  return null
}

function resolveTargetFromRequest(
  request: NextRequest,
  body?: { target?: unknown; provider?: unknown }
): ProviderRuntimeTarget {
  const fromQuery = parseTarget(request.nextUrl.searchParams.get('target'))
  if (fromQuery) return fromQuery
  const fromQueryProvider = parseTarget(request.nextUrl.searchParams.get('provider'))
  if (fromQueryProvider) return fromQueryProvider
  const fromBody = body ? parseTarget(body.target ?? body.provider) : null
  return fromBody ?? 'nationwide'
}

function serializeState(state: EsnetProviderRuntimeState) {
  return {
    enabled: state.enabled,
    enabledAt: state.enabledAt,
    disabledAt: state.disabledAt,
    disabledReason: state.disabledReason,
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

  let body: { enabled?: boolean; target?: unknown; provider?: unknown }
  try {
    body = (await request.json()) as { enabled?: boolean; target?: unknown; provider?: unknown }
  } catch {
    return jsonError(
      400,
      'INVALID_BODY',
      'Expected JSON body { "enabled": true | false, "target"?: "nationwide" | "ingest" | "bootstrap" }'
    )
  }

  if (typeof body.enabled !== 'boolean') {
    return jsonError(400, 'INVALID_BODY', 'Field "enabled" must be a boolean')
  }

  const target = resolveTargetFromRequest(request, body)
  const reason: CoverageBootstrapDisabledReason = 'admin'

  try {
    const admin = getAdminDb()
    if (target === 'ingest') {
      const state = await setEsnetIngestEnabled(admin, { enabled: body.enabled, reason })
      logger.info('ES.net ingest toggled from admin', {
        component: 'api/admin/ingestion/coverage-bootstrap',
        target,
        enabled: body.enabled,
      })
      return NextResponse.json({ ok: true, target, runtimeState: serializeState(state) })
    }

    if (target === 'bootstrap') {
      const state = await setEsnetBootstrapEnabled(admin, { enabled: body.enabled, reason })
      logger.info('ES.net bootstrap toggled from admin', {
        component: 'api/admin/ingestion/coverage-bootstrap',
        target,
        enabled: body.enabled,
      })
      return NextResponse.json({ ok: true, target, runtimeState: serializeState(state) })
    }

    const state = await setCoverageBootstrapEnabled(admin, { enabled: body.enabled, reason })
    logger.info('Nationwide coverage bootstrap toggled from admin', {
      component: 'api/admin/ingestion/coverage-bootstrap',
      target,
      enabled: body.enabled,
    })
    return NextResponse.json({
      ok: true,
      target,
      coverageBootstrap: serializeState(state),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(
      'Provider runtime toggle failed',
      err instanceof Error ? err : new Error(message),
      { component: 'api/admin/ingestion/coverage-bootstrap', target }
    )
    return jsonError(500, 'PROVIDER_RUNTIME_TOGGLE_FAILED', message)
  }
}

export async function GET(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  const target = resolveTargetFromRequest(request)

  try {
    const admin = getAdminDb()
    if (target === 'ingest') {
      const state = await fetchEsnetIngestState(admin)
      return NextResponse.json({ ok: true, target, runtimeState: serializeState(state) })
    }
    if (target === 'bootstrap') {
      const state = await fetchEsnetBootstrapState(admin)
      return NextResponse.json({ ok: true, target, runtimeState: serializeState(state) })
    }
    const state = await fetchCoverageBootstrapState(admin)
    return NextResponse.json({
      ok: true,
      target,
      coverageBootstrap: serializeState(state),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonError(500, 'PROVIDER_RUNTIME_READ_FAILED', message)
  }
}
