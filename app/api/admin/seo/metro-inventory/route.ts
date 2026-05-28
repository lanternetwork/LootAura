import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { fetchAllSeoMetroInventory } from '@/lib/seo/fetchAllSeoMetroInventory'

export const dynamic = 'force-dynamic'

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status })
}

/** Live metro inventory for SEO operational dashboard (Phase 6). */
export async function GET(request: NextRequest) {
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    return jsonError(403, 'FORBIDDEN', 'Admin access required')
  }

  try {
    const inventoryBySlug = await fetchAllSeoMetroInventory()
    return NextResponse.json({ ok: true, inventoryBySlug, generatedAt: new Date().toISOString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Metro inventory fetch failed'
    return jsonError(500, 'METRO_INVENTORY_FAILED', message)
  }
}
