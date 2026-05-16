import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { applyPhase4PublicPublishedSaleReadFilters } from '@/lib/sales/phase4PublicPublishedSaleReadFilters'
import { isValidUuid } from '@/lib/sanitize'

/** Public profile handles: 3–32 chars, alphanumeric plus underscore and hyphen. */
const PUBLIC_USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/

export type PublicListingsUserLookup =
  | { readonly kind: 'id'; readonly value: string }
  | { readonly kind: 'username'; readonly value: string }

/**
 * Resolve `user` query param to a safe profiles_v2 lookup (no PostgREST `.or()` interpolation).
 * Returns null when the param is empty or contains unsafe filter syntax characters.
 */
export function parsePublicListingsUserParam(raw: string): PublicListingsUserLookup | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (isValidUuid(trimmed)) {
    return { kind: 'id', value: trimmed }
  }
  if (PUBLIC_USERNAME_RE.test(trimmed)) {
    return { kind: 'username', value: trimmed }
  }
  return null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const userParam = url.searchParams.get('user') || ''
  const page = Number(url.searchParams.get('page') || '1')
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || '12')))
  if (!userParam) return NextResponse.json({ error: 'user required' }, { status: 400 })

  const lookup = parsePublicListingsUserParam(userParam)
  if (!lookup) {
    return NextResponse.json({ error: 'invalid user' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const profileQuery = supabase.from('profiles_v2').select('id, username')
  const prof =
    lookup.kind === 'id'
      ? await profileQuery.eq('id', lookup.value).maybeSingle()
      : await profileQuery.eq('username', lookup.value).maybeSingle()

  if (!prof.data?.id) return NextResponse.json({ error: 'user not found' }, { status: 404 })
  const userId = prof.data.id

  const from = (page - 1) * limit
  const to = from + limit - 1
  const q = await applyPhase4PublicPublishedSaleReadFilters(
    supabase
      .from('sales_v2')
      .select('id, title, cover_url, address, status, owner_id', { count: 'exact' })
      .eq('owner_id', userId)
  ).range(from, to)

  const items = q.data || []
  const total = q.count || 0
  const hasMore = to + 1 < total
  return NextResponse.json({ items, page, hasMore })
}
