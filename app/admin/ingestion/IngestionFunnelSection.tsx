'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { ResponsiveContainer, LineChart, Line, Tooltip } from 'recharts'
import type {
  IngestionFunnelMetrics,
  IngestionFunnelStage,
  IngestionFunnelWindowMetrics,
} from '@/lib/admin/ingestionMetricsTypes'

type Leaderboards = IngestionFunnelWindowMetrics['configLeaderboards']

const LAYER_LABEL: Record<string, string> = {
  crawler: 'Crawler encounters',
  unique_listings: 'Unique listings',
  publishable: 'Publishable inventory',
}

const LAYER_COLOR: Record<string, string> = {
  crawler: 'bg-sky-100 border-sky-300 text-sky-950',
  unique_listings: 'bg-violet-100 border-violet-300 text-violet-950',
  publishable: 'bg-emerald-100 border-emerald-300 text-emerald-950',
}

function pct(v: number | null): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function formatHour(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })
  } catch {
    return iso
  }
}

function Sparkline({ data, color }: { data: Array<{ bucket: string; count: number }>; color: string }) {
  if (data.length === 0) {
    return <div className="h-10 text-xs text-gray-400">No trend data</div>
  }
  const chartData = data.map((d) => ({ label: formatHour(d.bucket), count: d.count }))
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line type="monotone" dataKey="count" stroke={color} strokeWidth={1.5} dot={false} />
          <Tooltip
            contentStyle={{ fontSize: 11 }}
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload?.label ? String(payload[0].payload.label) : ''
            }
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function FunnelBar({ stage, maxCount }: { stage: IngestionFunnelStage; maxCount: number }) {
  const widthPct = maxCount > 0 ? Math.max(4, Math.round((stage.count / maxCount) * 100)) : 4
  const isLoss =
    stage.id === 'duplicate_skipped' ||
    stage.id === 'skipped_expired' ||
    stage.id === 'expired_at_insert' ||
    stage.id === 'invalid_address' ||
    stage.id === 'address_gated' ||
    stage.id === 'native_coord_failed' ||
    stage.id === 'geocode_failed' ||
    stage.id === 'publish_failed'

  const barStyle: CSSProperties = { width: `${widthPct}%` }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${LAYER_COLOR[stage.layer] ?? 'bg-gray-100'}`}
          >
            {LAYER_LABEL[stage.layer] ?? stage.layer}
          </span>
          <span className="font-medium text-gray-900">{stage.label}</span>
          {stage.id === 'duplicate_skipped' && (
            <span className="text-xs text-amber-800">(saturation / dedupe)</span>
          )}
          {stage.id === 'skipped_expired' && (
            <span className="text-xs text-rose-800">(stale inventory)</span>
          )}
        </div>
        <div className="tabular-nums text-gray-700">
          <span className="font-semibold">{stage.count.toLocaleString()}</span>
          {stage.conversionFromPrevious != null && (
            <span className="ml-2 text-xs text-gray-500">from prev {pct(stage.conversionFromPrevious)}</span>
          )}
          {stage.dropoffFromPrevious > 0 && (
            <span className="ml-2 text-xs text-red-700">−{stage.dropoffFromPrevious.toLocaleString()}</span>
          )}
        </div>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ${isLoss ? 'bg-amber-500' : stage.id === 'published' ? 'bg-emerald-600' : 'bg-indigo-500'}`}
          style={barStyle}
        />
      </div>
    </div>
  )
}

function ConfigLeaderboardTables({ leaderboards }: { leaderboards: Leaderboards }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <LeaderboardTable title="Top fresh-yield configs" rows={leaderboards.topFreshYield} valueKey="freshInsertYield" />
      <LeaderboardTable title="Top stale configs (expired discovery)" rows={leaderboards.topStale} valueKey="expiredDiscoveryRatio" />
      <LeaderboardTable title="Top duplicate configs" rows={leaderboards.topDuplicate} valueKey="windowDupSkips" />
    </div>
  )
}

function LeaderboardTable({
  title,
  rows,
  valueKey,
}: {
  title: string
  rows: Leaderboards['topFreshYield']
  valueKey: 'freshInsertYield' | 'expiredDiscoveryRatio' | 'windowDupSkips'
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-800">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">No configs with enough window activity yet.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="py-1 pr-2">Config</th>
              <th className="py-1 pr-2 text-right">Fetched</th>
              <th className="py-1 text-right">Signal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.state}|${row.city}`} className="border-t border-gray-100">
                <td className="py-1.5 pr-2 font-mono">
                  {row.city}, {row.state}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{row.windowFetched}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {valueKey === 'windowDupSkips'
                    ? row.windowDupSkips
                    : pct(
                        valueKey === 'freshInsertYield'
                          ? row.freshInsertYield
                          : row.expiredDiscoveryRatio
                      )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function WindowPanel({ windowKey, metrics }: { windowKey: '24h' | '7d'; metrics: IngestionFunnelWindowMetrics }) {
  const maxCount = Math.max(...metrics.stages.map((s) => s.count), 1)
  const rec = metrics.reconciliation

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-gray-200 bg-white p-3 text-sm">
          <p className="text-xs font-medium uppercase text-gray-500">Unique canonical URLs</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{metrics.uniqueCanonicalUrls}</p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-3 text-sm">
          <p className="text-xs font-medium uppercase text-gray-500">Duplicate hits (dedupe telemetry)</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{metrics.duplicateHits.total}</p>
          <p className="mt-1 text-xs text-gray-600">
            existing URL {metrics.duplicateHits.duplicate_existing_url} · cross-page{' '}
            {metrics.duplicateHits.duplicate_cross_city_page} · canonical{' '}
            {metrics.duplicateHits.duplicate_canonical_collision} · expired row{' '}
            {metrics.duplicateHits.duplicate_expired_row}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-3 text-sm">
          <p className="text-xs font-medium uppercase text-gray-500">Crawler reconcile</p>
          <p className={`mt-1 text-sm font-medium ${rec.crawlerReconciles ? 'text-emerald-800' : 'text-amber-800'}`}>
            {rec.crawlerReconciles ? 'Balanced' : `Δ ${rec.crawlerDelta}`}
          </p>
          <p className="mt-1 text-xs text-gray-600">
            discovered {rec.crawlerDiscovered} = inserted {rec.crawlerInserted} + skipped {rec.crawlerSkipped} +
            invalid {rec.crawlerInvalid}
          </p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-3 text-sm">
          <p className="text-xs font-medium uppercase text-gray-500">Cohort partition</p>
          <p
            className={`mt-1 text-sm font-medium ${rec.cohortMatchesInserted ? 'text-emerald-800' : 'text-amber-800'}`}
          >
            {rec.cohortMatchesInserted ? 'Sums to inserted' : `Δ ${rec.cohortPartitionSum - rec.dbInserted}`}
          </p>
          <p className="mt-1 text-xs text-gray-600">
            DB inserted {rec.dbInserted} · orch inserted {rec.crawlerInserted} · Δ{' '}
            {rec.dbOrchestrationInsertedDelta}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-rose-200 bg-rose-50/80 p-3 text-sm">
          <p className="text-xs font-medium uppercase text-rose-800">Fresh insert yield</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-950">
            {pct(metrics.freshRates.freshInsertYield)}
          </p>
          <p className="mt-1 text-xs text-rose-900">
            Skipped expired at discovery: {metrics.skippedExpired.toLocaleString()}
          </p>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50/80 p-3 text-sm">
          <p className="text-xs font-medium uppercase text-amber-900">Expired discovery ratio</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{pct(metrics.freshRates.expiredDiscoveryRatio)}</p>
        </div>
        <div className="rounded-md border border-stone-200 bg-stone-50/80 p-3 text-sm">
          <p className="text-xs font-medium uppercase text-stone-700">Expired insert ratio (cohort)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{pct(metrics.freshRates.expiredInsertRatio)}</p>
          <p className="mt-1 text-xs text-stone-600">Fresh inserted: {metrics.freshInserted.toLocaleString()}</p>
        </div>
      </div>

      <ConfigLeaderboardTables leaderboards={metrics.configLeaderboards} />

      <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3 text-sm">
        <p className="font-semibold text-emerald-950">YSTM detail-first READY (Phase 3B)</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-emerald-800">Attempted</dt>
            <dd className="font-medium tabular-nums">{metrics.detailFirst.attempted.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-emerald-800">Ready at insert</dt>
            <dd className="font-medium tabular-nums">{metrics.detailFirst.succeeded.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-emerald-800">Published same run</dt>
            <dd className="font-medium tabular-nums">{metrics.detailFirst.published.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-emerald-800">Fallback to legacy</dt>
            <dd className="font-medium tabular-nums">{metrics.detailFirst.fallback.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-emerald-800">Detail fetch failed</dt>
            <dd className="font-medium tabular-nums">{metrics.detailFirst.fetchFailed.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-emerald-800">Fresh → READY rate</dt>
            <dd className="font-medium tabular-nums">{pct(metrics.detailFirst.freshInsertReadyAtInsertRate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-emerald-800">Detail-first success rate</dt>
            <dd className="font-medium tabular-nums">{pct(metrics.detailFirst.providerGeocodeBypassRate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-emerald-800">Median ms → published</dt>
            <dd className="font-medium tabular-nums">
              {metrics.detailFirst.medianMsToPublished != null
                ? Math.round(metrics.detailFirst.medianMsToPublished).toLocaleString()
                : '—'}
            </dd>
          </div>
        </dl>
      </div>

      {metrics.topDropoff && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <span className="font-semibold">Top dropoff ({windowKey}):</span>{' '}
          {metrics.topDropoff.fromStageId} → {metrics.topDropoff.toStageId}: lose{' '}
          {metrics.topDropoff.count.toLocaleString()}
          {metrics.topDropoff.rate != null && ` (${pct(metrics.topDropoff.rate)} of prior stage)`}
        </div>
      )}

      <div className="space-y-3">
        {metrics.stages.map((stage) => (
          <FunnelBar key={stage.id} stage={stage} maxCount={maxCount} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <p className="mb-1 text-xs font-medium uppercase text-gray-500">Discovered / hour</p>
          <Sparkline data={metrics.sparklines.discoveredByHour} color="#0284c7" />
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <p className="mb-1 text-xs font-medium uppercase text-gray-500">Inserted / hour</p>
          <Sparkline data={metrics.sparklines.insertedByHour} color="#7c3aed" />
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <p className="mb-1 text-xs font-medium uppercase text-gray-500">Published / hour</p>
          <Sparkline data={metrics.sparklines.publishedByHour} color="#059669" />
        </div>
      </div>

      <div className="overflow-auto rounded-md border border-gray-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Platform</th>
              <th className="px-3 py-2">Inserted</th>
              <th className="px-3 py-2">Unique URLs</th>
              <th className="px-3 py-2">Published</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(metrics.bySourcePlatform)
              .sort(([, a], [, b]) => b.inserted - a.inserted)
              .map(([platform, row]) => (
                <tr key={platform} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-mono text-xs">{platform}</td>
                  <td className="px-3 py-2 tabular-nums">{row.inserted}</td>
                  <td className="px-3 py-2 tabular-nums">{row.uniqueCanonicalUrls}</td>
                  <td className="px-3 py-2 tabular-nums">{row.published}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-violet-200 bg-violet-50/60 p-3 text-sm">
        <p className="font-semibold text-violet-950">YSTM detail breakdown</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-violet-800">Discovered (crawler)</dt>
            <dd className="font-medium tabular-nums">{metrics.ystm.discovered}</dd>
          </div>
          <div>
            <dt className="text-xs text-violet-800">Duplicate / skipped</dt>
            <dd className="font-medium tabular-nums">{metrics.ystm.duplicate_skipped}</dd>
          </div>
          <div>
            <dt className="text-xs text-violet-800">Inserted</dt>
            <dd className="font-medium tabular-nums">{metrics.ystm.inserted}</dd>
          </div>
          <div>
            <dt className="text-xs text-violet-800">Published</dt>
            <dd className="font-medium tabular-nums">{metrics.ystm.published}</dd>
          </div>
          <div>
            <dt className="text-xs text-violet-800">Unique canonical URLs</dt>
            <dd className="font-medium tabular-nums">{metrics.ystm.uniqueCanonicalUrls}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

export default function IngestionFunnelSection({ funnel }: { funnel: IngestionFunnelMetrics }) {
  const [windowKey, setWindowKey] = useState<'24h' | '7d'>('24h')
  const metrics = funnel[windowKey]

  const layerSummary = useMemo(() => {
    const discovered = metrics.stages.find((s) => s.id === 'discovered')?.count ?? 0
    const inserted = metrics.stages.find((s) => s.id === 'inserted')?.count ?? 0
    const published = metrics.stages.find((s) => s.id === 'published')?.count ?? 0
    const dup = metrics.stages.find((s) => s.id === 'duplicate_skipped')?.count ?? 0
    return { discovered, inserted, published, dup }
  }, [metrics])

  return (
    <section className="mb-6 rounded-lg border border-gray-300 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Ingestion funnel</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Why discovered volume does not become map sales — exact counts from orchestration notes and
            ingested_sales (no estimates). Duplicate / saturation is labeled separately from unique inserts.
          </p>
        </div>
        <div className="flex rounded-lg border border-gray-200 p-0.5 text-sm">
          {(['24h', '7d'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setWindowKey(k)}
              className={`rounded-md px-3 py-1.5 font-medium ${
                windowKey === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {k === '24h' ? '24h rolling' : '7d rolling'}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-md bg-sky-50 px-3 py-2 text-sm">
          <p className="text-xs text-sky-800">Crawler discovered</p>
          <p className="font-semibold tabular-nums">{layerSummary.discovered}</p>
        </div>
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm">
          <p className="text-xs text-amber-900">Duplicates skipped</p>
          <p className="font-semibold tabular-nums">{layerSummary.dup}</p>
        </div>
        <div className="rounded-md bg-violet-50 px-3 py-2 text-sm">
          <p className="text-xs text-violet-800">Unique inserted</p>
          <p className="font-semibold tabular-nums">{layerSummary.inserted}</p>
        </div>
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm">
          <p className="text-xs text-emerald-800">Published</p>
          <p className="font-semibold tabular-nums">{layerSummary.published}</p>
        </div>
      </div>

      <WindowPanel windowKey={windowKey} metrics={metrics} />
    </section>
  )
}
