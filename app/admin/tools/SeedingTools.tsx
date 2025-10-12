'use client'

import React from 'react'

type RunOpts = {
  path: string
  method?: 'POST' | 'GET'
  dryRun?: boolean
  body?: any
  token: string
}

export default function SeedingTools() {
  const [token, setToken] = React.useState('')
  const [dryRun, setDryRun] = React.useState(true)
  const [count, setCount] = React.useState(25)
  const [centerZip, setCenterZip] = React.useState('')
  const [radiusMi, setRadiusMi] = React.useState(10)
  const [windowKey, setWindowKey] = React.useState<'any'|'today'|'weekend'|'next_weekend'>('any')
  const [logs, setLogs] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)

  const append = (line: string) => setLogs(prev => [...prev, line])
  const clear = () => setLogs([])

  async function run({ path, method = 'POST', dryRun, body, token }: RunOpts) {
    if (!token || token.length < 8) {
      alert('Please paste a valid SEED_TOKEN for this action.')
      return
    }
    if (!confirm(`Are you sure you want to call ${path}?`)) return
    setBusy(true)
    clear()
    try {
      const url = new URL(path, window.location.origin)
      if (typeof dryRun === 'boolean') url.searchParams.set('dryRun', String(dryRun))
      append(`[request] ${url.pathname}${url.search}`)
      const res = await fetch(url.toString(), {
        method,
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${token}`
        },
        body: body ? JSON.stringify(body) : undefined
      })
      append(`[response] status=${res.status}`)
      let json: any = null
      try { json = await res.json() } catch {}
      if (res.status === 401) {
        append('Unauthorized. Check SEED_TOKEN.')
      } else if (res.status === 429) {
        append('Rate limited. Try again later.')
      }
      if (json) {
        append(`[summary] ${JSON.stringify(json).slice(0, 2000)}`)
      }
    } catch (e: any) {
      append(`[error] ${e?.message || e}`)
    } finally {
      setBusy(false)
    }
  }

  const runMock = () => run({ path: '/api/admin/seed/mock', token })
  const runZipcodes = () => run({ path: '/api/admin/seed/zipcodes', token, dryRun })
  const runGenerate = () => run({
    path: '/api/admin/seed/generate',
    token,
    body: { count, centerZip: centerZip || undefined, radiusMi, window: windowKey }
  })

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-neutral-700">SEED_TOKEN (paste each time)</label>
          <input type="password" className="w-72 rounded border px-2 py-1" value={token} onChange={(e)=>setToken(e.target.value)} placeholder="••••••" />
        </div>
        <div className="ml-auto" />
      </div>

      <div className="rounded border p-3">
        <div className="mb-2 font-medium">Zip Codes Ingest</div>
        <label className="mr-3 inline-flex items-center gap-1 text-xs"><input type="checkbox" checked={dryRun} onChange={(e)=>setDryRun(e.target.checked)} /> dryRun</label>
        <button type="button" className="rounded border px-2 py-1 text-xs" disabled={busy} onClick={runZipcodes}>Ingest ZIP Codes (full US)</button>
      </div>

      <div className="rounded border p-3">
        <div className="mb-2 font-medium">Mock Sales</div>
        <div className="mb-2 text-neutral-600">Seeds a small fixed set (~20) of demo sales + items.</div>
        <button type="button" className="rounded border px-2 py-1 text-xs" disabled={busy} onClick={runMock}>Seed Mock Sales (20)</button>
      </div>

      <div className="rounded border p-3">
        <div className="mb-2 font-medium">Generate Random Sales</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <label className="block text-neutral-700">Count</label>
            <input type="number" min={1} max={500} value={count} onChange={(e)=>setCount(Number(e.target.value||25))} className="w-full rounded border px-2 py-1" />
          </div>
          <div>
            <label className="block text-neutral-700">Center ZIP (optional)</label>
            <input value={centerZip} onChange={(e)=>setCenterZip(e.target.value)} className="w-full rounded border px-2 py-1" placeholder="e.g. 40204" />
          </div>
          <div>
            <label className="block text-neutral-700">Radius (miles)</label>
            <input type="number" min={1} max={100} value={radiusMi} onChange={(e)=>setRadiusMi(Number(e.target.value||10))} className="w-full rounded border px-2 py-1" />
          </div>
          <div>
            <label className="block text-neutral-700">Date Window</label>
            <select value={windowKey} onChange={(e)=>setWindowKey(e.target.value as any)} className="w-full rounded border px-2 py-1">
              <option value="any">any</option>
              <option value="today">today</option>
              <option value="weekend">weekend</option>
              <option value="next_weekend">next_weekend</option>
            </select>
          </div>
        </div>
        <div className="mt-2">
          <button type="button" className="rounded border px-2 py-1 text-xs" disabled={busy} onClick={runGenerate}>Generate Random Sales</button>
        </div>
        <div className="mt-1 text-xs text-neutral-600">If the endpoint is not present, the request will fail safely.</div>
      </div>

      <div className="rounded border bg-neutral-50 p-2">
        <div className="mb-1 text-xs font-medium">Logs</div>
        <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-[11px] leading-relaxed">
          {logs.length ? logs.join('\n') : 'No logs yet.'}
        </div>
      </div>
    </div>
  )
}


