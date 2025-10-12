'use client'

import React from 'react'
import CopyButton from './CopyButton'

type CheckSpec = { name: string; path: string }
type CheckResult = {
  name: string
  ok: boolean
  status: 'ok' | 'warn' | 'error'
  ms: number
  detail?: Record<string, any>
  hint?: string
}

const CHECKS: CheckSpec[] = [
  { name: 'env', path: '/api/health/env' },
  { name: 'db', path: '/api/health/db' },
  { name: 'schema', path: '/api/health/schema' },
  { name: 'postgis', path: '/api/health/postgis' },
  { name: 'mapbox', path: '/api/health/mapbox' },
  { name: 'auth', path: '/api/health/auth' },
]

function classify(name: string, ok: boolean, body: any): { status: 'ok' | 'warn' | 'error'; hint?: string } {
  if (!ok) return { status: 'error', hint: 'Check logs and environment configuration.' }
  if (name === 'postgis') {
    const missing = Number(body?.missing_geom ?? 0)
    if (missing > 0) return { status: 'warn', hint: 'Run geom backfill or verify trigger/indexes.' }
  }
  if (name === 'mapbox') {
    const token = body?.tokenPrefix
    if (!token) return { status: 'warn', hint: 'Set NEXT_PUBLIC_MAPBOX_TOKEN for maps.' }
  }
  return { status: 'ok' }
}

export default function HealthChecks() {
  const [loading, setLoading] = React.useState(false)
  const [results, setResults] = React.useState<CheckResult[]>([])

  const run = React.useCallback(async () => {
    setLoading(true)
    const out: CheckResult[] = []
    for (const c of CHECKS) {
      const t0 = performance.now()
      try {
        const res = await fetch(c.path, { cache: 'no-store' })
        const body = await res.json().catch(() => ({}))
        const ms = Math.round(performance.now() - t0)
        const ok = !!body?.ok || res.ok
        const { status, hint } = classify(c.name, ok, body)
        // Pick a tiny subset for detail
        const detail: Record<string, any> = {}
        if (c.name === 'postgis') detail.missing_geom = body?.missing_geom ?? null
        if (c.name === 'env') detail.envKeys = Object.keys(body?.env || {}).length
        if (c.name === 'mapbox') detail.tokenPrefix = body?.tokenPrefix || null
        out.push({ name: c.name, ok, status, ms, detail, hint })
      } catch (e: any) {
        const ms = Math.round(performance.now() - t0)
        out.push({ name: c.name, ok: false, status: 'error', ms, hint: 'Endpoint failed to respond.' })
      }
    }
    setResults(out)
    setLoading(false)
  }, [])

  React.useEffect(() => {
    run()
  }, [run])

  return (
    <div className="space-y-3">
      <div>
        <button type="button" className="rounded border px-3 py-1 text-sm" onClick={run} disabled={loading}>
          {loading ? 'Running…' : 'Refresh checks'}
        </button>
        {!!results.length && (
          <span className="ml-2 inline-block">
            <CopyButton
              className="rounded border px-3 py-1 text-sm"
              text={JSON.stringify(results, null, 2)}
            >Copy results (JSON)</CopyButton>
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-neutral-600">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">ms</th>
              <th className="py-2 pr-4">Detail</th>
            </tr>
          </thead>
          <tbody>
            {results.map(r => (
              <tr key={r.name} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{r.name}</td>
                <td className="py-2 pr-4">{r.status === 'ok' ? '✅' : r.status === 'warn' ? '⚠️' : '❌'}</td>
                <td className="py-2 pr-4 font-mono">{r.ms}</td>
                <td className="py-2 pr-4 font-mono text-xs">{Object.entries(r.detail || {}).map(([k,v]) => `${k}:${v}`).join(' ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {results.some(r => r.status !== 'ok' && r.hint) && (
        <div className="text-xs text-amber-700">
          {results.filter(r => r.status !== 'ok' && r.hint).map(r => (
            <div key={`hint-${r.name}`}>{r.name}: {r.hint}</div>
          ))}
        </div>
      )}
    </div>
  )
}


