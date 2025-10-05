import { cookies, headers } from 'next/headers'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function maskCoord(n?: number): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—'
  return n.toFixed(3)
}

async function fetchJson(path: string) {
  try {
    const res = await fetch(path, { cache: 'no-store' })
    const ok = res.ok
    let body: any = null
    try { body = await res.json() } catch {}
    return { ok, body }
  } catch {
    return { ok: false, body: null }
  }
}

export default async function AdminTools() {
  const cookieStore = cookies()
  const headersList = await headers()
  // Using relative URLs ensures requests hit the same deployment

  // Parse la_loc cookie
  let laLoc: { lat?: number; lng?: number; zip?: string; city?: string; state?: string } | null = null
  const raw = cookieStore.get('la_loc')?.value
  if (raw) {
    try {
      laLoc = JSON.parse(raw)
    } catch {}
  }

  // Infer source used this load (best-effort)
  let source: 'cookie' | 'profile.zip' | 'ip' | 'neutral' = 'neutral'
  if (laLoc?.lat && laLoc?.lng) {
    source = 'cookie'
  } else if (headersList.get('x-vercel-ip-latitude')) {
    source = 'ip'
  }

  // Health checks
  const [envH, dbH, schemaH, postgisH, searchH] = await Promise.all([
    fetchJson('/api/health/env'),
    fetchJson('/api/health/db'),
    fetchJson('/api/health/schema'),
    fetchJson('/api/health/postgis'),
    fetchJson('/api/health/search'),
  ])

  const Badge = ({ ok }: { ok: boolean }) => (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {ok ? 'OK' : 'FAIL'}
    </span>
  )

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin Tools</h1>
        <nav className="text-sm flex items-center gap-3">
          <Link href="/admin/usage" className="text-blue-600 hover:underline">Usage Diagnostics</Link>
          <a href="#location" className="text-blue-600 hover:underline">Location Tools</a>
          <a href="#health" className="text-blue-600 hover:underline">Health</a>
          <a href="#diagnostics" className="text-blue-600 hover:underline">Diagnostics</a>
        </nav>
      </div>

      {/* Location state */}
      <div id="location" className="rounded-lg border bg-white p-4">
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
          <form action="/api/geocoding/zip" method="get" target="_blank" className="inline-flex items-center gap-2 text-sm">
            <input name="zip" placeholder="Test ZIP" className="border rounded px-2 py-1" />
            <button className="px-2 py-1 border rounded hover:bg-gray-50" type="submit">Test ZIP lookup</button>
          </form>
        </div>
      </div>

      {/* Health overview */}
      <div id="health" className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-medium mb-2">Health Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center justify-between border rounded px-3 py-2"><span>Env</span><Badge ok={!!envH.ok} /></div>
          <div className="flex items-center justify-between border rounded px-3 py-2"><span>DB</span><Badge ok={!!dbH.ok} /></div>
          <div className="flex items-center justify-between border rounded px-3 py-2"><span>Schema</span><Badge ok={!!schemaH.ok} /></div>
          <div className="flex items-center justify-between border rounded px-3 py-2"><span>PostGIS</span><Badge ok={!!postgisH.ok} /></div>
          <div className="flex items-center justify-between border rounded px-3 py-2"><span>Search</span><Badge ok={!!searchH.ok} /></div>
        </div>
        <div className="mt-3 text-xs text-gray-600">Detailed endpoints are available under /api/health/*</div>
      </div>

      {/* Diagnostics and Seeds */}
      <div id="diagnostics" className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-medium mb-2">Diagnostics & Seeds</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Link href="/api/debug-tables" className="border rounded px-3 py-2 hover:bg-gray-50">Debug Tables</Link>
          <Link href="/api/test-db" className="border rounded px-3 py-2 hover:bg-gray-50">Test DB</Link>
          <Link href="/api/test-rpc" className="border rounded px-3 py-2 hover:bg-gray-50">Test RPC</Link>
          <Link href="/api/test-sale-lookup" className="border rounded px-3 py-2 hover:bg-gray-50">Test Sale Lookup</Link>
          <Link href="/api/test-reviews-table" className="border rounded px-3 py-2 hover:bg-gray-50">Test Reviews Table</Link>
          <Link href="/api/test-reviews-insert" className="border rounded px-3 py-2 hover:bg-gray-50">Test Reviews Insert</Link>
          <Link href="/api/test-reviews-creation" className="border rounded px-3 py-2 hover:bg-gray-50">Test Reviews Creation</Link>
          <Link href="/api/test-batch-reviews" className="border rounded px-3 py-2 hover:bg-gray-50">Test Batch Reviews</Link>
          <Link href="/api/seed-public" className="border rounded px-3 py-2 hover:bg-gray-50">Seed Public</Link>
          <Link href="/api/seed-direct" className="border rounded px-3 py-2 hover:bg-gray-50">Seed Direct</Link>
        </div>
      </div>
    </div>
  )
}


