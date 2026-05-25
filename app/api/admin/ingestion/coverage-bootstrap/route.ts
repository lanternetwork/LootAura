import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import {
  fetchEsnetCoverageBootstrapState,
  setEsnetCoverageBootstrapEnabled,
} from '@/lib/ingestion/estatesalesnet/coverageBootstrapEstatesalesNet'
import {
  fetchCoverageBootstrapState,
  setCoverageBootstrapEnabled,
  type CoverageBootstrapDisabledReason,
} from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'
import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export const dynamic = 'force-dynamic'

export type CoverageBootstrapProvider = 'nationwide' | 'estatesales_net'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

function parseProvider(value: unknown): CoverageBootstrapProvider | null {
  if (value === 'nationwide' || value === 'estatesales_net') return value
  return null
}

function resolveProviderFromRequest(request: NextRequest, body?: { provider?: unknown }): CoverageBootstrapProvider {
  const fromQuery = parseProvider(request.nextUrl.searchParams.get('provider'))
  if (fromQuery) return fromQuery
  const fromBody = body ? parseProvider(body.provider) : null
  return fromBody ?? 'nationwide'
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

  let body: { enabled?: boolean; provider?: unknown }
  try {
    body = (await request.json()) as { enabled?: boolean; provider?: unknown }
  } catch {
    return jsonError(400, 'INVALID_BODY', 'Expected JSON body { "enabled": true | false, "provider"?: "nationwide" | "estatesales_net" }')
  }

  if (typeof body.enabled !== 'boolean') {
    return jsonError(400, 'INVALID_BODY', 'Field "enabled" must be a boolean')
  }

  const provider = resolveProviderFromRequest(request, body)
  const reason: CoverageBootstrapDisabledReason = 'admin'

  try {
    const admin = getAdminDb()
    const state =
      provider === 'estatesales_net'
        ? await setEsnetCoverageBootstrapEnabled(admin, { enabled: body.enabled, reason })
        : await setCoverageBootstrapEnabled(admin, { enabled: body.enabled, reason })
    logger.info('Coverage bootstrap toggled from admin', {
      component: 'api/admin/ingestion/coverage-bootstrap',
      provider,
      enabled: body.enabled,
    })
    return NextResponse.json({
      ok: true,
      provider,
      coverageBootstrap: {
        enabled: state.enabled,
        enabledAt: state.enabledAt,
        disabledAt: state.disabledAt,
        disabledReason: state.disabledReason,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(
      'Coverage bootstrap toggle failed',
      err instanceof Error ? err : new Error(message),
      { component: 'api/admin/ingestion/coverage-bootstrap', provider }
    )
    return jsonError(500, 'COVERAGE_BOOTSTRAP_TOGGLE_FAILED', message)
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

  const provider = resolveProviderFromRequest(request)

  try {
    const admin = getAdminDb()
    const state =
      provider === 'estatesales_net'
        ? await fetchEsnetCoverageBootstrapState(admin)
        : await fetchCoverageBootstrapState(admin)
    return NextResponse.json({
      ok: true,
      provider,
      coverageBootstrap: {
        enabled: state.enabled,
        enabledAt: state.enabledAt,
        disabledAt: state.disabledAt,
        disabledReason: state.disabledReason,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonError(500, 'COVERAGE_BOOTSTRAP_READ_FAILED', message)
  }
}
