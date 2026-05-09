import { logger } from '@/lib/log'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { sanitizeUploadDescription } from '@/lib/ingestion/uploadDescriptionSanitizer'
import { normalizeAddressForPublish } from '@/lib/ingestion/publish'
import { formatAddressForPublishedSaleDisplay } from '@/lib/ingestion/formatDisplayAddress'
import { validateResolvedAddressForPublish } from '@/lib/ingestion/publishValidation'

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

export type IngestedSalesRepairInput = {
  dryRun: boolean
  limit: number
}

export type IngestedSalesRepairResult = {
  dryRun: boolean
  scanned: number
  skipped: number
  repaired: {
    ingestedDescription: number
    salesDescription: number
    salesAddress: number
  }
  writes: number
}

export type IngestedSalesRepairVerification = {
  pollutedDescriptions: number
  duplicatedAddresses: number
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const out = value.replace(/\s+/g, ' ').trim()
  return out.length > 0 ? out : null
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

export async function runIngestedSalesRepair(input: IngestedSalesRepairInput): Promise<IngestedSalesRepairResult> {
  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, 'sales')
    .select('id, ingested_sale_id, description, address, city, state, ingested:ingested_sale_id(id, description, raw_text, city, state)')
    .not('ingested_sale_id', 'is', null)
    .limit(input.limit)

  if (error) {
    logger.error('Admin ingestion repair failed to load linked rows', new Error(error.message), {
      component: 'admin/ingested-sales-repair',
      operation: 'load_rows',
      limit: input.limit,
    })
    throw new Error(`Failed to load linked rows: ${error.message}`)
  }

  const rows = (Array.isArray(data) ? (data as unknown as LinkedRepairRow[]) : [])

  let scanned = 0
  let skipped = 0
  let ingestedDescriptionRepairs = 0
  let salesDescriptionRepairs = 0
  let salesAddressRepairs = 0
  let writes = 0

  for (const row of rows) {
    scanned += 1
    let rowHadRepair = false

    const linkedIngested = getLinkedIngestedRow(row.ingested)
    if (!row.ingested_sale_id || !linkedIngested?.id) {
      skipped += 1
      continue
    }

    const ingestedDescriptionOriginal = normalizeText(linkedIngested.description)
    const ingestedDescriptionClean = sanitizeUploadDescription(ingestedDescriptionOriginal)
    const shouldRepairIngestedDescription =
      ingestedDescriptionClean !== ingestedDescriptionOriginal ||
      normalizeText(linkedIngested.raw_text) !== ingestedDescriptionClean

    if (shouldRepairIngestedDescription) {
      rowHadRepair = true
      ingestedDescriptionRepairs += 1
      if (!input.dryRun) {
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
      rowHadRepair = true
      salesDescriptionRepairs += 1
      if (!input.dryRun) {
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

    let addressPassesPublishGate = false
    if (shouldRepairSaleAddress) {
      try {
        validateResolvedAddressForPublish(normalizedAddress, city, state)
        addressPassesPublishGate = true
      } catch {
        addressPassesPublishGate = false
      }
    }

    if (shouldRepairSaleAddress && addressPassesPublishGate) {
      rowHadRepair = true
      salesAddressRepairs += 1
      const displayAddress = formatAddressForPublishedSaleDisplay(normalizedAddress)
      if (!input.dryRun) {
        const { error: upErr } = await fromBase(admin, 'sales')
          .update({ address: displayAddress })
          .eq('id', row.id)
        if (!upErr) writes += 1
      }
    }

    if (!rowHadRepair) skipped += 1
  }

  logger.info('Admin ingested-linked repair run completed', {
    component: 'admin/ingested-sales-repair',
    operation: 'repair_run',
    dryRun: input.dryRun,
    scanned,
    skipped,
    ingestedDescriptionRepairs,
    salesDescriptionRepairs,
    salesAddressRepairs,
    writes,
  })

  return {
    dryRun: input.dryRun,
    scanned,
    skipped,
    repaired: {
      ingestedDescription: ingestedDescriptionRepairs,
      salesDescription: salesDescriptionRepairs,
      salesAddress: salesAddressRepairs,
    },
    writes,
  }
}

export async function verifyIngestedSalesRepair(): Promise<IngestedSalesRepairVerification> {
  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, 'sales')
    .select('description, address, city, state')
    .not('ingested_sale_id', 'is', null)
    .limit(5000)

  if (error) {
    throw new Error(`Verification query failed: ${error.message}`)
  }

  const rows = Array.isArray(data) ? (data as Array<{ description?: string | null; address?: string | null; city?: string | null; state?: string | null }>) : []
  const pollutedPattern = /(street view|directions|source:|garagesalefinder\.com|yardsaletreasuremap\.com)/i

  let pollutedDescriptions = 0
  let duplicatedAddresses = 0

  for (const row of rows) {
    const description = normalizeText(row.description)
    if (description && pollutedPattern.test(description)) {
      pollutedDescriptions += 1
    }

    const address = normalizeText(row.address)
    const city = normalizeText(row.city)
    const state = normalizeText(row.state)
    if (address && city && state && hasDuplicatedCityStateSuffix(address, city, state)) {
      duplicatedAddresses += 1
    }
  }

  return { pollutedDescriptions, duplicatedAddresses }
}

