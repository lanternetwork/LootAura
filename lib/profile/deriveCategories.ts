import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function deriveCategories(userId: string, monthsLookback = 12): Promise<string[]> {
  const supabase = createSupabaseServerClient()
  const since = new Date()
  since.setMonth(since.getMonth() - monthsLookback)
  // Use SQL aggregation to avoid transferring all rows
  const { data, error } = await supabase.rpc('derive_user_categories', {
    p_user_id: userId,
    p_since: since.toISOString(),
    p_limit: 5,
  })
  if (error || !Array.isArray(data)) {
    // Fallback to simple select if RPC not available
    const sel = await supabase
      .from('sales_v2')
      .select('categories, created_at')
      .eq('owner_id', userId)
      .gte('created_at', since.toISOString())
    const rows = sel.data || []
    const counts = new Map<string, number>()
    for (const row of rows) {
      const cats: string[] = Array.isArray((row as any).categories) ? (row as any).categories : []
      for (const c of cats) counts.set(c, (counts.get(c) || 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c)
  }
  return (data as { category: string }[]).map(r => r.category)
}


