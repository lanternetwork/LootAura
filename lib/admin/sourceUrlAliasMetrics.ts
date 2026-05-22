import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type SourceUrlAliasMetrics = {
  totalAliasRows: number
}

export async function loadSourceUrlAliasMetrics(): Promise<SourceUrlAliasMetrics> {
  const admin = getAdminDb()

  const { count: totalAliasRows, error: totalErr } = await fromBase(admin, 'ingested_sale_source_urls')
    .select('id', { count: 'exact', head: true })
  if (totalErr) throw new Error(totalErr.message)

  return {
    totalAliasRows: totalAliasRows ?? 0,
  }
}
