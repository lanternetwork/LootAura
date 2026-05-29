'use client'

import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  buildSeoOperationalSnapshot,
  emptyInventoryByMetroSlug,
} from '@/lib/seo/buildSeoOperationalSnapshot'
import { computeSeoSitemapCounts } from '@/lib/seo/sitemap/computeSitemapCounts'
import type { SeoInventorySummary } from '@/lib/seo/types'
import SeoDistributionPilotPanel from '@/app/admin/ingestion/SeoDistributionPilotPanel'
import { useEffect, useMemo, useState } from 'react'

const GATE_STYLE = {
  pass: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  fail: 'border-red-300 bg-red-50 text-red-950',
  pending: 'border-slate-300 bg-slate-50 text-slate-700',
  blocked: 'border-amber-300 bg-amber-50 text-amber-950',
} as const

const TIER_LABEL = {
  pilot: 'Pilot',
  expansion_active: 'Expansion (active)',
  expansion_candidate: 'Expansion candidate',
} as const

type Props = {
  metrics: IngestionMetricsResponse
  coverage: YstmCoverageMetricsResponse | null
  publishedListingCount?: number
}

export default function SeoOperationalPanel({ metrics, coverage, publishedListingCount = 0 }: Props) {
  const [inventoryBySlug, setInventoryBySlug] = useState<Record<string, SeoInventorySummary>>(
    () => emptyInventoryByMetroSlug()
  )
  const [inventoryStatus, setInventoryStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setInventoryStatus('loading')
    fetch('/api/admin/seo/metro-inventory', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Metro inventory request failed')
        const body = (await res.json()) as {
          ok: boolean
          inventoryBySlug?: Record<string, SeoInventorySummary>
        }
        if (!body.ok || !body.inventoryBySlug) throw new Error('Invalid metro inventory response')
        if (!cancelled) {
          setInventoryBySlug(body.inventoryBySlug)
          setInventoryStatus('ready')
        }
      })
      .catch(() => {
        if (!cancelled) setInventoryStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const snapshot = useMemo(() => {
    const sitemapCounts = computeSeoSitemapCounts({
      totalPublishedListings: publishedListingCount,
      nationalIndexingAllowed: false,
      inventoryBySlug,
    })
    const provisional = buildSeoOperationalSnapshot({
      metrics,
      coverage,
      sitemapCounts,
      inventoryByMetroSlug: inventoryBySlug,
    })
    return buildSeoOperationalSnapshot({
      metrics,
      coverage,
      sitemapCounts: computeSeoSitemapCounts({
        totalPublishedListings: publishedListingCount,
        nationalIndexingAllowed: provisional.rollout.indexingAllowed,
        inventoryBySlug,
      }),
      inventoryByMetroSlug: inventoryBySlug,
    })
  }, [metrics, coverage, publishedListingCount, inventoryBySlug])

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">SEO operational readiness</h2>
          <p className="mt-1 text-sm text-slate-600">
            Index allowlist derives from ingestion gates. Phase 6 expansion metros activate via{' '}
            <code className="text-xs">SEO_EXPANSION_METRO_SLUGS</code>. Phase 5 rollout env vars
            control <code className="text-xs">noindex</code> removal.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
              snapshot.allowlist.indexingAllowed
                ? 'bg-emerald-100 text-emerald-900'
                : 'bg-amber-100 text-amber-900'
            }`}
          >
            {snapshot.allowlist.indexingAllowed ? 'ops allowlist pass' : 'ops allowlist blocked'}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
              snapshot.rollout.indexingAllowed
                ? 'bg-emerald-100 text-emerald-900'
                : 'bg-amber-100 text-amber-900'
            }`}
          >
            {snapshot.rollout.indexingAllowed ? 'index rollout ready' : 'index rollout blocked'}
          </span>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Live metro inventory:{' '}
        {inventoryStatus === 'loading'
          ? 'loading…'
          : inventoryStatus === 'error'
            ? 'unavailable (using zeros)'
            : 'loaded'}
      </p>

      {snapshot.rollout.blockers.length > 0 && (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-semibold">Rollout blockers</p>
          <ul className="mt-1 list-inside list-disc">
            {snapshot.rollout.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Tier 1 ready" value={snapshot.allowlist.tier1Ready ? 'yes' : 'no'} />
        <MetricCard label="Tier 2 ready" value={snapshot.allowlist.tier2Ready ? 'yes' : 'no'} />
        <MetricCard
          label="Canonical coverage"
          value={
            snapshot.metrics.canonicalCoveragePct != null
              ? `${snapshot.metrics.canonicalCoveragePct.toFixed(1)}%`
              : '—'
          }
        />
        <MetricCard
          label="Avg crawlable inventory"
          value={
            snapshot.metrics.crawlableInventoryPct != null
              ? `${(snapshot.metrics.crawlableInventoryPct * 100).toFixed(0)}%`
              : '—'
          }
        />
        <MetricCard
          label="Duplicate canonical clusters"
          value={
            snapshot.metrics.duplicateCanonicalClusters != null
              ? String(snapshot.metrics.duplicateCanonicalClusters)
              : '—'
          }
        />
        <MetricCard
          label="Catalog repair queue"
          value={
            snapshot.metrics.catalogRepairQueue != null
              ? snapshot.metrics.catalogRepairQueue.toLocaleString()
              : '—'
          }
        />
        <MetricCard
          label="Missing valid URLs"
          value={
            snapshot.metrics.missingValidUrls != null
              ? snapshot.metrics.missingValidUrls.toLocaleString()
              : '—'
          }
        />
        <MetricCard label="Sitemap listing URLs" value={snapshot.sitemap.listingUrlCount.toLocaleString()} />
        <MetricCard label="Active metros" value={String(snapshot.metroExpansion.activeMetroSlugs.length)} />
      </div>

      <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
        <p className="font-semibold text-slate-900">Phase 5 crawl smoke</p>
        <p className="mt-1 text-slate-600">
          Run{' '}
          <code className="text-xs">GET /api/admin/seo/crawl-smoke?metroSlug=dallas-tx&amp;saleId=…</code>{' '}
          then set Phase 5 attestation env vars. See{' '}
          <code className="text-xs">docs/SEO_PHASE5_CRAWL_VALIDATION.md</code>.
        </p>
        {snapshot.rollout.qualifiedMetroSlugs.length > 0 && (
          <p className="mt-2 text-xs text-slate-600">
            Qualified for index rollout: {snapshot.rollout.qualifiedMetroSlugs.join(', ')}
          </p>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-900">Metro expansion (Phase 6)</p>
        <p className="mt-1 text-xs text-slate-600">
          Activate candidates with <code className="text-xs">SEO_EXPANSION_METRO_SLUGS</code>. See{' '}
          <code className="text-xs">docs/SEO_PHASE6_METRO_EXPANSION.md</code>.
        </p>
        <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
          {snapshot.metroExpansion.rows.map((row) => (
            <li
              key={row.slug}
              className={`rounded border px-3 py-2 text-xs ${
                row.qualified
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                  : 'border-slate-300 bg-slate-50 text-slate-700'
              }`}
            >
              <span className="font-semibold">{row.slug}</span> — {TIER_LABEL[row.tier]} — score{' '}
              {row.score}
              {row.pageActive ? ' · page active' : ' · page inactive'}
              {row.qualified ? ' (qualified)' : ''}
              <span className="block mt-1 text-slate-600">
                {row.inventory.activeListingCount} listings ·{' '}
                {(row.inventory.crawlableInventoryPct * 100).toFixed(0)}% crawlable
                {row.inventory.lastUpdatedAt
                  ? ` · updated ${new Date(row.inventory.lastUpdatedAt).toLocaleString()}`
                  : ''}
              </span>
              {row.reasons.length > 0 && (
                <span className="block mt-1 text-slate-600">{row.reasons.join('; ')}</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <SeoDistributionPilotPanel activeMetroSlugs={snapshot.metroExpansion.activeMetroSlugs} />

      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-900">Index rollout gates</p>
        <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
          {snapshot.rollout.gates.map((gate) => (
            <li
              key={gate.id}
              className={`rounded border px-3 py-2 text-xs ${GATE_STYLE[gate.status]}`}
            >
              <span className="font-semibold uppercase">{gate.status}</span> [{gate.source}]: {gate.label}{' '}
              — {gate.detail}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-900">Operational allowlist gates</p>
        <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
          {snapshot.allowlist.gates.map((gate) => (
            <li
              key={gate.id}
              className={`rounded border px-3 py-2 text-xs ${GATE_STYLE[gate.status]}`}
            >
              <span className="font-semibold uppercase">{gate.status}</span> [{gate.source}]: {gate.label}{' '}
              — {gate.detail}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}
