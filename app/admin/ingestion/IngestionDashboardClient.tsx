'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'

const POLL_MS = 5000
const MAX_SNAPSHOT_POINTS = 360

type SnapshotPoint = {
  t: number
  backlog: number
  efficiency: number | null
}

function formatHourLabel(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })
  } catch {
    return iso
  }
}

export default function IngestionDashboardClient() {
  const [data, setData] = useState<IngestionMetricsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [snapshots, setSnapshots] = useState<SnapshotPoint[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ingestion/metrics', { credentials: 'include' })
      const json = (await res.json()) as IngestionMetricsResponse & { code?: string; message?: string }

      if (!res.ok || !json.ok) {
        throw new Error((json as { message?: string }).message || `HTTP ${res.status}`)
      }

      setData(json)
      setError(null)

      const now = Date.now()
      setSnapshots((prev) =>
        [...prev, { t: now, backlog: json.backlog, efficiency: json.efficiency }].slice(-MAX_SNAPSHOT_POINTS)
      )
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

  const backlogChartData = snapshots.map((p, i) => ({
    i,
    t: new Date(p.t).toLocaleTimeString(),
    backlog: p.backlog,
  }))

  const efficiencyChartData = snapshots.map((p, i) => ({
    i,
    t: new Date(p.t).toLocaleTimeString(),
    efficiency: p.efficiency == null ? null : Math.round(p.efficiency * 1000) / 10,
  }))

  const throughputData =
    data?.timeseries.publishedByHour.map((row) => ({
      label: formatHourLabel(row.bucket),
      count: row.count,
    })) ?? []

  const durationData =
    data?.timeseries.durationMsByHour.map((row) => ({
      label: formatHourLabel(row.bucket),
      ms: row.value,
    })) ?? []

  const rate429Data =
    data?.timeseries.rate429ByHour.map((row) => ({
      label: formatHourLabel(row.bucket),
      count: row.count,
    })) ?? []

  const claimedOrchestrationData =
    data?.timeseries.claimedByHour.map((row) => ({
      label: formatHourLabel(row.bucket),
      count: row.count,
    })) ?? []

  const geocodeSuccessOrchestrationData =
    data?.timeseries.geocodeSuccessByHour.map((row) => ({
      label: formatHourLabel(row.bucket),
      count: row.count,
    })) ?? []

  const publishSuccessOrchestrationData =
    data?.timeseries.publishSuccessByHour.map((row) => ({
      label: formatHourLabel(row.bucket),
      count: row.count,
    })) ?? []

  return (
    <div className="min-h-screen bg-gray-50 py-8 text-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Ingestion metrics</h1>
            <p className="mt-1 text-sm text-gray-600">
              Polls every {POLL_MS / 1000}s · Timeseries from DB (48h) + live backlog / efficiency samples
            </p>
          </div>
          <Link
            href="/admin/tools"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
          >
            ← Admin tools
          </Link>
        </div>

        {loading && !data && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-600">Loading…</div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            <p className="font-medium">Failed to load metrics</p>
            <p className="mt-1 text-sm">{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true)
                void load()
              }}
              className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-800"
            >
              Retry
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <MetricCard label="Backlog (needs_geocode)" value={data.backlog} highlight />
              <MetricCard label="Published 24h" value={data.published24h} />
              <MetricCard label="Claimed 24h (runs)" value={data.claimed24h} />
              <MetricCard label="Geocode touches 24h" value={data.geocodeTouches24h} />
              <MetricCard
                label="Efficiency (pub / claimed)"
                value={data.efficiency == null ? '—' : `${(data.efficiency * 100).toFixed(1)}%`}
              />
              <MetricCard label="Updated" value={new Date(data.generatedAt).toLocaleTimeString()} />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard title="Backlog (live samples)">
                {backlogChartData.length < 2 ? (
                  <p className="py-8 text-center text-sm text-gray-500">Collecting samples…</p>
                ) : (
                  <ChartWrap>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={backlogChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="t" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="backlog" stroke="#2563eb" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartWrap>
                )}
              </ChartCard>

              <ChartCard title="Throughput (sales rows with ingested_sale_id / hour, 48h)">
                <ChartWrap>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={throughputData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={4} angle={-35} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#059669" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWrap>
              </ChartCard>

              <ChartCard title="Efficiency % (live samples, published/claimed ratio)">
                {efficiencyChartData.length < 2 ? (
                  <p className="py-8 text-center text-sm text-gray-500">Collecting samples…</p>
                ) : (
                  <ChartWrap>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={efficiencyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="t" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="efficiency"
                          stroke="#d97706"
                          dot={false}
                          strokeWidth={2}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartWrap>
                )}
              </ChartCard>

              <ChartCard title="Geocoder 429 (sum per hour, ingestion_orchestration_runs)">
                <ChartWrap>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rate429Data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={4} angle={-35} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#b45309" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWrap>
              </ChartCard>

              <ChartCard title="Orchestration geo+publish duration (avg ms / hour)">
                <ChartWrap>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={durationData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={4} angle={-35} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="ms" stroke="#7c3aed" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartWrap>
              </ChartCard>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <ChartCard title="Orchestration: claimed rows / hour">
                <ChartWrap>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={claimedOrchestrationData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={4} angle={-35} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0369a1" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWrap>
              </ChartCard>
              <ChartCard title="Orchestration: geocode succeeded / hour">
                <ChartWrap>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={geocodeSuccessOrchestrationData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={4} angle={-35} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0d9488" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWrap>
              </ChartCard>
              <ChartCard title="Orchestration: publish succeeded / hour">
                <ChartWrap>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={publishSuccessOrchestrationData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={4} angle={-35} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#4f46e5" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWrap>
              </ChartCard>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-lg font-semibold">Failure breakdown (ingested_sales)</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      Object.entries(data.failureBreakdown) as Array<[string, number]>
                    ).map(([k, v]) => (
                      <tr key={k} className="border-b border-gray-100">
                        <td className="py-2 pr-4 font-mono text-xs">{k}</td>
                        <td className="py-2">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-lg font-semibold">Oldest stuck rows (20)</h2>
                <div className="max-h-96 overflow-auto text-sm">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="sticky top-0 border-b bg-white text-gray-500">
                        <th className="py-2 pr-2">Status</th>
                        <th className="py-2 pr-2">City</th>
                        <th className="py-2 pr-2">Attempts</th>
                        <th className="py-2 pr-2">Updated</th>
                        <th className="py-2">Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.oldestStuckRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-gray-500">
                            No rows in needs_geocode / ready / publishing / publish_failed.
                          </td>
                        </tr>
                      ) : (
                        data.oldestStuckRows.map((row) => (
                          <tr key={row.id} className="border-b border-gray-50">
                            <td className="py-2 pr-2 font-mono">{row.status}</td>
                            <td className="py-2 pr-2">
                              {row.city}, {row.state}
                            </td>
                            <td className="py-2 pr-2">{row.geocode_attempts ?? '—'}</td>
                            <td className="py-2 pr-2 whitespace-nowrap">
                              {new Date(row.updated_at).toLocaleString()}
                            </td>
                            <td className="py-2">
                              <a
                                href={row.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                source
                              </a>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string | number
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-4 shadow-sm ${
        highlight ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      {children}
    </div>
  )
}

function ChartWrap({ children }: { children: ReactNode }) {
  return <div className="h-64 w-full">{children}</div>
}
