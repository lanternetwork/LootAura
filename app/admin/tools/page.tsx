import { cookies, headers } from 'next/headers'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function maskCoord(n?: number): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—'
  return n.toFixed(3)
}

export default async function AdminTools() {
  const cookieStore = cookies()
  const headersList = await headers()

  // Parse la_loc cookie
  let laLoc: { lat?: number; lng?: number; zip?: string; city?: string; state?: string } | null = null
  const raw = cookieStore.get('la_loc')?.value
  if (raw) {
    try {
      laLoc = JSON.parse(raw)
    } catch {}
  }

  // Infer source used this load
  // Priority: cookie → profile.zip (hint via x-la-source header optional) → IP → neutral
  // We don't have a header plumbed; approximate from available signals
  let source: 'cookie' | 'profile.zip' | 'ip' | 'neutral' = 'neutral'
  if (laLoc?.lat && laLoc?.lng) {
    source = 'cookie'
  } else if (headersList.get('x-vercel-ip-latitude')) {
    source = 'ip'
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Admin Tools</h1>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-medium mb-2">Location state</h2>
        <div className="text-sm text-gray-700 space-y-1">
          <div>
            <span className="text-gray-500">la_loc:</span>{' '}
            {laLoc ? (
              <>
                lat {maskCoord(typeof laLoc.lat === 'string' ? Number(laLoc.lat) : laLoc.lat)}, lng {maskCoord(typeof laLoc.lng === 'string' ? Number(laLoc.lng) : laLoc.lng)}
                {laLoc.zip && <span> • {laLoc.zip}</span>}
                {(laLoc.city || laLoc.state) && <span> • {laLoc.city}{laLoc.city && laLoc.state ? ', ' : ''}{laLoc.state}</span>}
              </>
            ) : (
              <span>not set</span>
            )}
          </div>
          <div>
            <span className="text-gray-500">Source:</span> {source}
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <Link
            href="/admin/tools/clear"
            className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
          >
            Clear la_loc cookie (this browser)
          </Link>
          <Link
            href="/sales?simulateNeutral=1"
            className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
          >
            Simulate neutral fallback
          </Link>
        </div>
      </div>
    </div>
  )
}


