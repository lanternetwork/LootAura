import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function deriveCategories(userId: string, monthsLookback = 12): Promise<string[]> {
  const supabase = createSupabaseServerClient()
  const since = new Date()
  since.setMonth(since.getMonth() - monthsLookback)
  const { data } = await supabase
    .from('sales_v2')
    .select('categories')
    .eq('owner_id', userId)
    .gte('created_at', since.toISOString())
  if (!data) return []
  const counts = new Map<string, number>()
  for (const row of data) {
    const cats: string[] = Array.isArray(row.categories) ? row.categories : []
    for (const c of cats) counts.set(c, (counts.get(c) || 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c)
}


