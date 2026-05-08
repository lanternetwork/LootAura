import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { logger } from '@/lib/log'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { sanitizeUploadDescription } from '@/lib/ingestion/uploadDescriptionSanitizer'
import { normalizeAddressForPublish } from '@/lib/ingestion/publish'

export const dynamic = 'force-dynamic'

type RepairBody = {
  dryRun?: boolean
  limit?: number
}

type LinkedRepairRow = {
  id: string
  ingested_sale_id: string | null
  description: string | null
  address: string | null
  city: string | null
  state: string | null
  ingested?: {
    id: string
    description: string | null
    raw_text: string | null
    city: string | null
    state: string | null
  } | Array<{
    id: string
    description: string | null
    raw_text: string | null
    city: string | null
    state: string | null
  }> | null
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const out = value.replace(/\s+/g, ' ').trim()
  return out.length > 0 ? out : null
}

function hasDuplicatedCityStateSuffix(address: string, city: string, state: string): boolean {
  const cityNorm = city.trim()
  const stateNorm = state.trim()
  const cityEsc = cityNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const stateEsc = stateNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const cityStatePattern = new RegExp(`${cityEsc}\\s*,\\s*${stateEsc}(?:\\s+\\d{5}(?:-\\d{4})?)?`, 'gi')
  const matches = address.match(cityStatePattern) ?? []
  if (matches.length < 2) return false
  const trailingCityState = new RegExp(`,\\s*${cityEsc}\\s*,\\s*${stateEsc}\\s*$`, 'i')
  return trailingCityState.test(address)
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

function getLinkedIngestedRow(value: LinkedRepairRow['ingested']): {
  id: string
  description: string | null
  raw_text: string | null
  city: string | null
  state: string | null
} | null {
  if (!value) return null
  if (Array.isArray(value)) {
    const first = value[0]
    return first && typeof first.id === 'string' ? first : null
  }
  return typeof value.id === 'string' ? value : null
}

async function repairHandler(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      const status = error.status
      if (status === 401) return jsonError(401, 'UNAUTHORIZED', 'Unauthorized')
      if (status === 403) return jsonError(403, 'FORBIDDEN', 'Admin access required')
      return jsonError(status, 'AUTH_ERROR', 'Authentication failed')
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  let body: RepairBody = {}
  try {
    body = (await request.json()) as RepairBody
  } catch {
    body = {}
  }

  const dryRun = body.dryRun !== false
  const limitParsed = Number(body.limit)
  const limit =
    Number.isFinite(limitParsed) && limitParsed > 0 ? Math.min(Math.floor(limitParsed), 2000) : 500

  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, 'sales')
    .select('id, ingested_sale_id, description, address, city, state, ingested:ingested_sale_id(id, description, raw_text, city, state)')
    .not('ingested_sale_id', 'is', null)
    .limit(limit)

  if (error) {
    logger.error('Admin ingestion repair failed to load linked rows', new Error(error.message), {
      component: 'admin/ingested-sales-repair',
      operation: 'load_rows',
      limit,
    })
    return jsonError(500, 'LOAD_FAILED', 'Failed to load linked rows')
  }

  const rows = (Array.isArray(data) ? (data as unknown as LinkedRepairRow[]) : [])

  let scanned = 0
  let ingestedDescriptionRepairs = 0
  let salesDescriptionRepairs = 0
  let salesAddressRepairs = 0
  let writes = 0

  for (const row of rows) {
    scanned += 1
    const linkedIngested = getLinkedIngestedRow(row.ingested)
    if (!row.ingested_sale_id || !linkedIngested?.id) continue

    const ingestedDescriptionOriginal = normalizeText(linkedIngested.description)
    const ingestedDescriptionClean = sanitizeUploadDescription(ingestedDescriptionOriginal)
    const shouldRepairIngestedDescription =
      ingestedDescriptionClean !== ingestedDescriptionOriginal ||
      normalizeText(linkedIngested.raw_text) !== ingestedDescriptionClean

    if (shouldRepairIngestedDescription) {
      ingestedDescriptionRepairs += 1
      if (!dryRun) {
        const { error: upErr } = await fromBase(admin, 'ingested_sales')
          .update({
            description: ingestedDescriptionClean,
            raw_text: ingestedDescriptionClean,
          })
          .eq('id', linkedIngested.id)
        if (!upErr) writes += 1
      }
    }

    const saleDescriptionOriginal = normalizeText(row.description)
    const saleDescriptionClean = sanitizeUploadDescription(saleDescriptionOriginal)
    const shouldRepairSaleDescription =
      saleDescriptionOriginal != null &&
      saleDescriptionClean != null &&
      saleDescriptionClean !== saleDescriptionOriginal

    if (shouldRepairSaleDescription) {
      salesDescriptionRepairs += 1
      if (!dryRun) {
        const { error: upErr } = await fromBase(admin, 'sales')
          .update({ description: saleDescriptionClean })
          .eq('id', row.id)
        if (!upErr) writes += 1
      }
    }

    const city = normalizeText(row.city ?? linkedIngested.city)
    const state = normalizeText(row.state ?? linkedIngested.state)
    const saleAddressOriginal = normalizeText(row.address)
    const normalizedAddress =
      saleAddressOriginal && city && state ? normalizeAddressForPublish(saleAddressOriginal, city, state) : saleAddressOriginal
    const shouldRepairSaleAddress =
      !!saleAddressOriginal &&
      !!city &&
      !!state &&
      !!normalizedAddress &&
      normalizedAddress !== saleAddressOriginal &&
      hasDuplicatedCityStateSuffix(saleAddressOriginal, city, state)

    if (shouldRepairSaleAddress) {
      salesAddressRepairs += 1
      if (!dryRun) {
        const { error: upErr } = await fromBase(admin, 'sales')
          .update({ address: normalizedAddress })
          .eq('id', row.id)
        if (!upErr) writes += 1
      }
    }
  }

  logger.info('Admin ingested-linked repair run completed', {
    component: 'admin/ingested-sales-repair',
    operation: 'repair_run',
    dryRun,
    scanned,
    ingestedDescriptionRepairs,
    salesDescriptionRepairs,
    salesAddressRepairs,
    writes,
  })

  return NextResponse.json({
    ok: true,
    dryRun,
    scanned,
    repaired: {
      ingestedDescription: ingestedDescriptionRepairs,
      salesDescription: salesDescriptionRepairs,
      salesAddress: salesAddressRepairs,
    },
    writes,
  })
}

export const POST = withRateLimit(repairHandler, [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY])

