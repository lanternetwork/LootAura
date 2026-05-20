'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'

const POLL_MS = 30_000

function formatPct(value: number | null): string {
  if (value == null) return '—'
  return `${value.toFixed(1)}%`
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function YstmCoverageScoreboardSection() {
  const [data, setData] = useState<YstmCoverageMetricsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ingestion/ystm-coverage', { credentials: 'include' })
      const json = (await res.json()) as YstmCoverageMetricsResponse & { code?: string; message?: string }
      if (!res.ok || !json.ok) {
        throw new Error(json.message || `HTTP ${res.status}`)
      }
      setData(json)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  const trendData =
    data?.trend.map((p) => ({
      label: formatWhen(p.completedAt),
      coverage: p.coveragePct,
      valid: p.validActiveYstmUrls,
      visible: p.publishedVisibleInAudit,
    })) ?? []

  const missingStateRows = Object.entries(data?.missingByState ?? {}).sort((a, b) => b[1] - a[1])
  const missingMetroRows = Object.entries(data?.missingByMetro ?? {}).sort((a, b) => b[1] - a[1])

  return (
    <section className="mb-8 rounded-lg border border-emerald-300 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-emerald-950">YSTM nationwide coverage</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Product goal: published active LootAura YSTM sales visible on the map ÷ valid active YSTM sales from
            bounded audits. Not crawl discovered/skipped counts.
          </p>
        </div>
        <p className="text-xs text-gray-500">Last audit: {formatWhen(data?.lastAuditAt ?? null)}</p>
      </div>

      {loading && !data && <p className="text-sm text-gray-500">Loading coverage scoreboard…</p>}
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {data && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">Coverage</p>
              <p className="mt-1 text-3xl font-bold text-emerald-950">{formatPct(data.coveragePct)}</p>
              <p className="mt-1 text-xs text-emerald-900">Target {data.targetPct}%</p>
            </div>
            <div className="rounded-md border border-gray-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Valid active YSTM (audit)</p>
              <p className="mt-1 text-2xl font-semibold">{data.validActiveYstmUrls.toLocaleString()}</p>
              <p className="mt-1 text-xs text-gray-500">
                Footprint {data.observationFootprintUrls.toLocaleString()} URLs observed
              </p>
            </div>
            <div className="rounded-md border border-gray-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
                Published active LootAura
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {data.publishedActiveLootAuraYstmUrls.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {data.publishedVisibleInAuditFootprint.toLocaleString()} visible in audit footprint
              </p>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-900">Missing valid YSTM</p>
              <p className="mt-1 text-2xl font-semibold text-amber-950">
                {data.missingValidYstmUrls.toLocaleString()}
              </p>
            </div>
          </div>

          {data.lastRun && (
            <p className="mb-4 text-xs text-gray-600">
              Last run: {data.lastRun.listPagesFetched} list pages · {data.lastRun.listingUrlsDiscovered}{' '}
              URLs discovered · {data.lastRun.detailPagesValidated} detail checks · config cursor{' '}
              {data.lastRun.configCursorAfter}
            </p>
          )}

          {trendData.length > 1 && (
            <div className="mb-6 h-56 w-full">
              <p className="mb-2 text-sm font-medium text-gray-700">Coverage trend (completed audits)</p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="coverage" stroke="#047857" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Missing by state (top)</h3>
              {missingStateRows.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">No missing valid URLs in audit footprint yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {missingStateRows.map(([state, count]) => (
                    <li key={state} className="flex justify-between gap-4 border-b border-gray-100 py-1">
                      <span>{state}</span>
                      <span className="font-medium tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Missing by metro (top)</h3>
              {missingMetroRows.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">No metro breakdown yet.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {missingMetroRows.map(([metro, count]) => (
                    <li key={metro} className="flex justify-between gap-4 border-b border-gray-100 py-1">
                      <span className="truncate">{metro}</span>
                      <span className="shrink-0 font-medium tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
