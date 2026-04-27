import { ProcessedIngestedSale } from '@/lib/ingestion/types'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'

export interface IngestedSaleMatch {
  id: string
  matchType: 'source_url' | 'address_date' | 'soft_address_date'
}

export async function findIngestedSaleMatch(
  sourceUrl: string,
  processed: ProcessedIngestedSale
): Promise<IngestedSaleMatch | null> {
  const admin = getAdminDb()

  const bySource = await fromBase(admin, 'ingested_sales')
    .select('id')
    .eq('source_url', sourceUrl)
    .maybeSingle()
  if (bySource.data?.id) {
    return { id: bySource.data.id, matchType: 'source_url' }
  }

  if (!processed.normalizedAddress || !processed.dateStart) return null

  const byAddressDate = await fromBase(admin, 'ingested_sales')
    .select('id')
    .eq('normalized_address', processed.normalizedAddress)
    .eq('date_start', processed.dateStart)
    .maybeSingle()
  if (byAddressDate.data?.id) {
    return { id: byAddressDate.data.id, matchType: 'address_date' }
  }

  const softCandidates = await fromBase(admin, 'ingested_sales')
    .select('id, date_start')
    .eq('normalized_address', processed.normalizedAddress)
    .not('date_start', 'is', null)
    .limit(50)

  if (softCandidates.data && softCandidates.data.length > 0) {
    const current = new Date(`${processed.dateStart}T00:00:00Z`).getTime()
    const oneDayMs = 24 * 60 * 60 * 1000
    const match = softCandidates.data.find((row: { id: string; date_start: string }) => {
      const candidate = new Date(`${row.date_start}T00:00:00Z`).getTime()
      return Math.abs(candidate - current) <= oneDayMs
    })
    if (match) {
      return { id: match.id, matchType: 'soft_address_date' }
    }
  }

  return null
}

