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
  // Use relative paths for in-app API calls to avoid base URL issues

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

  // Health checks (auto-run)
  const [envH, dbH, schemaH, postgisH, searchH] = await Promise.all([
    fetchJson('/api/health/env'),
    fetchJson('/api/health/db'),
    fetchJson('/api/health/schema'),
    fetchJson('/api/health/postgis'),
    fetchJson('/api/health/search'),
  ])

  // Diagnostics tests (auto-run snapshot)
  const diagnostics = [
    { name: 'Debug Tables', path: '/api/debug-tables' },
    { name: 'Test DB', path: '/api/test-db' },
    { name: 'Test RPC', path: '/api/test-rpc' },
    { name: 'Test Sale Lookup', path: '/api/test-sale-lookup' },
    { name: 'Test Reviews Table', path: '/api/test-reviews-table' },
    { name: 'Test Reviews Insert', path: '/api/test-reviews-insert' },
    { name: 'Test Reviews Creation', path: '/api/test-reviews-creation' },
    { name: 'Test Batch Reviews', path: '/api/test-batch-reviews' },
  ] as const

  const diagResults = await Promise.all(
    diagnostics.map(async (t) => {
      const r = await fetchJson(t.path)
      return { name: t.name, path: t.path, ok: !!r.ok }
    })
  )

  const Badge = ({ ok }: { ok: boolean }) => (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {ok ? '✔' : '✖'}
    </span>
  )

  const allHealthOk = !!envH.ok && !!dbH.ok && !!schemaH.ok && !!postgisH.ok && !!searchH.ok
  const allDiagOk = diagResults.every((d) => d.ok)
  const overallOk = allHealthOk && allDiagOk

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-gray-600">Operational snapshot and diagnostic tools</p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${overallOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          <span className="text-lg">{overallOk ? '✔' : '✖'}</span>
          <span>{overallOk ? 'All systems nominal' : 'Attention required'}</span>
        </div>
      </div>

      {/* Top nav */}
      <nav className="text-sm flex items-center gap-3 border-b pb-3">
        <Link href="/admin/usage" className="text-blue-600 hover:underline">Usage Diagnostics</Link>
        <a href="#location" className="text-blue-600 hover:underline">Location Tools</a>
        <a href="#health" className="text-blue-600 hover:underline">Health</a>
        <a href="#diagnostics" className="text-blue-600 hover:underline">Diagnostics</a>
      </nav>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Location state */}
          <div id="location" className="rounded-lg border bg-white p-4 shadow-sm">
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
          <div className="mt-4 flex flex-wrap gap-3">
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

          {/* Health overview (snapshot) */}
          <div id="health" className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium mb-2">Health Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center justify-between border rounded px-3 py-2"><span>Env</span><div className="flex items-center gap-2"><Badge ok={!!envH.ok} /><Link href="/api/health/env" className="underline text-blue-600">Run</Link></div></div>
          <div className="flex items-center justify-between border rounded px-3 py-2"><span>DB</span><div className="flex items-center gap-2"><Badge ok={!!dbH.ok} /><Link href="/api/health/db" className="underline text-blue-600">Run</Link></div></div>
          <div className="flex items-center justify-between border rounded px-3 py-2"><span>Schema</span><div className="flex items-center gap-2"><Badge ok={!!schemaH.ok} /><Link href="/api/health/schema" className="underline text-blue-600">Run</Link></div></div>
          <div className="flex items-center justify-between border rounded px-3 py-2"><span>PostGIS</span><div className="flex items-center gap-2"><Badge ok={!!postgisH.ok} /><Link href="/api/health/postgis" className="underline text-blue-600">Run</Link></div></div>
          <div className="flex items-center justify-between border rounded px-3 py-2"><span>Search</span><div className="flex items-center gap-2"><Badge ok={!!searchH.ok} /><Link href="/api/health/search" className="underline text-blue-600">Run</Link></div></div>
        </div>
        <div className="mt-3 text-xs text-gray-600">Detailed endpoints are available under /api/health/*</div>
          </div>

          {/* Diagnostics and Seeds (snapshot) */}
          <div id="diagnostics" className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium mb-2">Diagnostics & Seeds</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {diagResults.map((r) => (
            <div key={r.path} className="flex items-center justify-between border rounded px-3 py-2">
              <span>{r.name}</span>
              <div className="flex items-center gap-2">
                <Badge ok={r.ok} />
                <Link href={r.path} className="underline text-blue-600">Run</Link>
              </div>
            </div>
          ))}
          <Link href="/api/seed-public" className="border rounded px-3 py-2 hover:bg-gray-50">Seed Public</Link>
          <Link href="/api/seed-direct" className="border rounded px-3 py-2 hover:bg-gray-50">Seed Direct</Link>
        </div>
          </div>
        </div>
        {/* Sidebar quick info */}
        <aside className="space-y-6">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="font-medium mb-2">Summary</h3>
            <div className="text-sm text-gray-700 space-y-1">
              <div className="flex items-center justify-between"><span>Health</span><Badge ok={allHealthOk} /></div>
              <div className="flex items-center justify-between"><span>Diagnostics</span><Badge ok={allDiagOk} /></div>
            </div>
          </div>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <h3 className="font-medium mb-2">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/sales" className="text-blue-600 underline">Sales</Link></li>
              <li><Link href="/favorites" className="text-blue-600 underline">Favorites</Link></li>
              <li><Link href="/explore" className="text-blue-600 underline">Explore</Link></li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}


