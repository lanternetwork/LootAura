'use client'

import type { ReactNode } from 'react'
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
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import CrawlSkipTaxonomySection from '@/app/admin/ingestion/CrawlSkipTaxonomySection'
import IngestionFunnelSection from '@/app/admin/ingestion/IngestionFunnelSection'
import YstmCoverageScoreboardSection from '@/app/admin/ingestion/YstmCoverageScoreboardSection'

type SnapshotPoint = {
  t: number
  backlog: number
  efficiency: number | null
}

type Props = {
  data: IngestionMetricsResponse
  snapshots: SnapshotPoint[]
  coverage: YstmCoverageMetricsResponse | null
  coverageLoading: boolean
  coverageError: string | null
  onCoverageRefresh: () => void | Promise<void>
}

function formatHourLabel(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })
  } catch {
    return iso
  }
}

export default function IngestionDebugPanel({
  data,
  snapshots,
  coverage,
  coverageLoading,
  coverageError,
  onCoverageRefresh,
}: Props) {
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

  const throughputData = data.timeseries.publishedByHour.map((row) => ({
    label: formatHourLabel(row.bucket),
    count: row.count,
  }))

  const durationData = data.timeseries.durationMsByHour.map((row) => ({
    label: formatHourLabel(row.bucket),
    ms: row.value,
  }))

  const rate429Data = data.timeseries.rate429ByHour.map((row) => ({
    label: formatHourLabel(row.bucket),
    count: row.count,
  }))

  const claimedOrchestrationData = data.timeseries.claimedByHour.map((row) => ({
    label: formatHourLabel(row.bucket),
    count: row.count,
  }))

  const listingsInsertedData = data.timeseries.listingsInsertedByHour.map((row) => ({
    label: formatHourLabel(row.bucket),
    count: row.count,
  }))

  const insertYieldData = data.timeseries.insertYieldByHour.map((row) => ({
    label: formatHourLabel(row.bucket),
    value: row.value == null ? null : Math.round(row.value * 1000) / 10,
  }))

  const saturationRateData = data.timeseries.saturationRateByHour.map((row) => ({
    label: formatHourLabel(row.bucket),
    value: row.value == null ? null : Math.round(row.value * 1000) / 10,
  }))

  const geocodeSuccessOrchestrationData = data.timeseries.geocodeSuccessByHour.map((row) => ({
    label: formatHourLabel(row.bucket),
    count: row.count,
  }))

  const publishSuccessOrchestrationData = data.timeseries.publishSuccessByHour.map((row) => ({
    label: formatHourLabel(row.bucket),
    count: row.count,
  }))

  const publishExpiredOrchestrationData = data.timeseries.publishExpiredByHour.map((row) => ({
    label: formatHourLabel(row.bucket),
    count: row.count,
  }))

  return (
    <div className="space-y-6">
      <YstmCoverageScoreboardSection
        variant="debug"
        coverage={coverage}
        coverageLoading={coverageLoading}
        coverageError={coverageError}
        onCoverageRefresh={onCoverageRefresh}
      />

      {data.volume && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-sm font-medium text-indigo-900">
            Active bottleneck: <span className="uppercase">{data.volume.bottleneck}</span>
          </p>
          <p className="mt-1 text-xs text-indigo-800">
            Geocode oldest age:{' '}
            {data.volume.geocode.oldestNeedsGeocodeAgeMs == null
              ? '—'
              : `${Math.round(data.volume.geocode.oldestNeedsGeocodeAgeMs / 60000)} min`}{' '}
            · Publish oldest ready:{' '}
            {data.volume.publish.oldestReadyAgeMs == null
              ? '—'
              : `${Math.round(data.volume.publish.oldestReadyAgeMs / 60000)} min`}{' '}
            · Crawl overdue configs: {data.volume.fetch.configsOverdue}
            · Address enrichment backlog: {data.volume.addressLifecycle.enrichmentBacklog}
            · Image enrichment backlog: {data.volume.imageEnrichment.backlog}
          </p>
        </div>
      )}

      {data.detailFirstMetricsBaselineAt && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          Funnel metrics window starts{' '}
          <time dateTime={data.detailFirstMetricsBaselineAt}>
            {new Date(data.detailFirstMetricsBaselineAt).toLocaleString()}
          </time>
          . Pre-baseline detail-first attempts are excluded from Phase 3B rollups.
        </p>
      )}

      {data.funnel && data.detailFirstProof && (
        <IngestionFunnelSection funnel={data.funnel} detailFirstProof={data.detailFirstProof} />
      )}

      {data.volume?.fetch && <CrawlSkipTaxonomySection fetch={data.volume.fetch} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <MetricCard
          label="Inserted / hour"
          value={data.volume.hourlyRates.listingsInsertedPerHour}
          title="Primary acquisition KPI"
          highlight
        />
        <MetricCard
          label="Insert yield (24h)"
          value={
            data.volume.fetch.insertYield24h == null
              ? '—'
              : `${(data.volume.fetch.insertYield24h * 100).toFixed(2)}%`
          }
        />
        <MetricCard
          label="Saturation (24h)"
          value={
            data.volume.fetch.saturationRate24h == null
              ? '—'
              : `${(data.volume.fetch.saturationRate24h * 100).toFixed(1)}%`
          }
          title="Recrawl duplicate skip pressure"
        />
        <MetricCard label="Backlog (needs_geocode)" value={data.backlog} />
        <MetricCard
          label="Geocode eligible"
          value={data.geocodeEligibleBacklog}
          title="needs_geocode + address_available + address_raw"
        />
        <MetricCard
          label="Needs check (D2)"
          value={data.failureBreakdown.needs_check}
          title="Publish review queue (e.g. low coordinate precision)"
        />
        <MetricCard label="Address enrichment" value={data.volume.addressLifecycle.enrichmentBacklog} />
        <MetricCard label="Image backlog (external source)" value={data.volume.imageEnrichment.backlog} />
        <MetricCard label="With image" value={data.volume.imageEnrichment.hasImage} />
        <MetricCard label="Published 24h" value={data.published24h} />
        <MetricCard label="Claimed 24h (runs)" value={data.claimed24h} />
        <MetricCard label="Geocode touches 24h" value={data.geocodeTouches24h} />
        <MetricCard
          label="Efficiency (pub / claimed)"
          value={data.efficiency == null ? '—' : `${(data.efficiency * 100).toFixed(1)}%`}
        />
        <MetricCard label="Updated" value={new Date(data.generatedAt).toLocaleTimeString()} />
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Acquisition</h2>
        <p className="text-sm text-gray-700">
          Crawlable {data.volume.acquisition.crawlableConfigs} · Saturated{' '}
          {data.volume.acquisition.saturatedConfigs} · Validated{' '}
          {data.volume.acquisition.validatedDiscoveryConfigs} · Manual{' '}
          {data.volume.acquisition.manualDiscoveryConfigs} · Pending{' '}
          {data.volume.acquisition.pendingDiscoveryConfigs} · Inserted/hr{' '}
          {data.volume.hourlyRates.listingsInsertedPerHour}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard title="Listings inserted / hour">
          {listingsInsertedData.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No data</p>
          ) : (
            <ChartWrap>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={listingsInsertedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#059669" />
                </BarChart>
              </ResponsiveContainer>
            </ChartWrap>
          )}
        </ChartCard>
        <ChartCard title="Insert yield % / hour">
          {insertYieldData.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No data</p>
          ) : (
            <ChartWrap>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={insertYieldData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#059669" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartWrap>
          )}
        </ChartCard>
        <ChartCard title="Saturation % / hour">
          {saturationRateData.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No data</p>
          ) : (
            <ChartWrap>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={saturationRateData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#dc2626" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartWrap>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Address lifecycle (D1)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4">address_status</th>
                <th className="py-2">Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.volume.addressLifecycle.byStatus)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([status, count]) => (
                  <tr key={status} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-mono text-xs">{status}</td>
                    <td className="py-2 tabular-nums">{count}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Image enrichment (D2.5)</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">External-source backlog</dt>
            <dd className="font-medium tabular-nums">{data.volume.imageEnrichment.backlog}</dd>
            <dt className="text-gray-500">Rows with image</dt>
            <dd className="font-medium tabular-nums">{data.volume.imageEnrichment.hasImage}</dd>
            <dt className="text-gray-500">Attempts (24h)</dt>
            <dd className="font-medium tabular-nums">{data.volume.imageEnrichment.attempted24h}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Geocode queue</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">All needs_geocode</dt>
              <dd className="font-medium tabular-nums">{data.volume.geocode.needsGeocodeCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Claim-eligible</dt>
              <dd className="font-medium tabular-nums">{data.volume.geocode.eligibleNeedsGeocodeCount}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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

        <ChartCard title="Throughput (published / hour, 48h)">
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

        <ChartCard title="Efficiency % (live samples)">
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

        <ChartCard title="Geocoder 429 / hour">
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

        <ChartCard title="Orchestration duration (avg ms / hour)">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="Orchestration: claimed / hour">
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
        <ChartCard title="Geocode succeeded / hour">
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
        <ChartCard title="Publish succeeded / hour">
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
        <ChartCard title="Publish expired / hour">
          <ChartWrap>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={publishExpiredOrchestrationData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={4} angle={-35} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#78716c" />
              </BarChart>
            </ResponsiveContainer>
          </ChartWrap>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
              {(Object.entries(data.failureBreakdown) as Array<[string, number]>).map(([k, v]) => (
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
                  <th className="py-2">Id</th>
                </tr>
              </thead>
              <tbody>
                {data.oldestStuckRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-gray-500">
                      No operational stuck rows in needs_geocode / ready / publishing / publish_failed.
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
                      <td className="py-2 font-mono text-xs text-gray-500">{row.id.slice(0, 8)}…</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  highlight,
  title,
}: {
  label: string
  value: string | number
  highlight?: boolean
  title?: string
}) {
  return (
    <div
      title={title}
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
