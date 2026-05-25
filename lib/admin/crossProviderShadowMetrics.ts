import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type CrossProviderShadowMetrics = {
  shadowRecords24h: number
  falseNegativeCount24h: number
  falseNegativeCount7d: number
  wouldLinkCount24h: number
  wouldSuppressPublishCount24h: number
  wouldPublishDistinctCount24h: number
  lastRecordedAt: string | null
}

export const EMPTY_CROSS_PROVIDER_SHADOW_METRICS: CrossProviderShadowMetrics = {
  shadowRecords24h: 0,
  falseNegativeCount24h: 0,
  falseNegativeCount7d: 0,
  wouldLinkCount24h: 0,
  wouldSuppressPublishCount24h: 0,
  wouldPublishDistinctCount24h: 0,
  lastRecordedAt: null,
}

export async function loadCrossProviderShadowMetrics(
  nowMs: number = Date.now()
): Promise<CrossProviderShadowMetrics> {
  const admin = getAdminDb()
  const since24h = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()
  const since7d = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString()

  const base24h = () =>
    fromBase(admin, 'cross_provider_sale_instance_shadow').gte('recorded_at', since24h)

  const { count: shadowRecords24h, error: totalErr } = await base24h().select('id', {
    count: 'exact',
    head: true,
  })
  if (totalErr) throw new Error(totalErr.message)

  const { count: falseNegativeCount24h, error: fn24Err } = await base24h()
    .eq('is_false_negative', true)
    .select('id', { count: 'exact', head: true })
  if (fn24Err) throw new Error(fn24Err.message)

  const { count: falseNegativeCount7d, error: fn7Err } = await fromBase(
    admin,
    'cross_provider_sale_instance_shadow'
  )
    .gte('recorded_at', since7d)
    .eq('is_false_negative', true)
    .select('id', { count: 'exact', head: true })
  if (fn7Err) throw new Error(fn7Err.message)

  const { count: wouldLinkCount24h, error: linkErr } = await base24h()
    .eq('disposition', 'would_link_observation')
    .select('id', { count: 'exact', head: true })
  if (linkErr) throw new Error(linkErr.message)

  const { count: wouldSuppressPublishCount24h, error: supErr } = await base24h()
    .eq('disposition', 'would_suppress_publish')
    .select('id', { count: 'exact', head: true })
  if (supErr) throw new Error(supErr.message)

  const { count: wouldPublishDistinctCount24h, error: distErr } = await base24h()
    .eq('disposition', 'would_publish_distinct')
    .select('id', { count: 'exact', head: true })
  if (distErr) throw new Error(distErr.message)

  const { data: lastRow, error: lastErr } = await fromBase(
    admin,
    'cross_provider_sale_instance_shadow'
  )
    .select('recorded_at')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastErr) throw new Error(lastErr.message)

  return {
    shadowRecords24h: shadowRecords24h ?? 0,
    falseNegativeCount24h: falseNegativeCount24h ?? 0,
    falseNegativeCount7d: falseNegativeCount7d ?? 0,
    wouldLinkCount24h: wouldLinkCount24h ?? 0,
    wouldSuppressPublishCount24h: wouldSuppressPublishCount24h ?? 0,
    wouldPublishDistinctCount24h: wouldPublishDistinctCount24h ?? 0,
    lastRecordedAt: (lastRow as { recorded_at?: string } | null)?.recorded_at ?? null,
  }
}
