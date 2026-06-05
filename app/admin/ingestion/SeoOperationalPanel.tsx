'use client'

import Link from 'next/link'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import {
  buildSeoOperationalSnapshot,
  emptyInventoryByMetroSlug,
} from '@/lib/seo/buildSeoOperationalSnapshot'
import { computeSeoSitemapCounts } from '@/lib/seo/sitemap/computeSitemapCounts'
import type { SeoInventorySummary, SeoMetro } from '@/lib/seo/types'
import {
  SEO_ROLLOUT_DISABLED_STATE,
  type SeoRolloutAttestationTarget,
  type SeoRolloutRuntimeState,
} from '@/lib/seo/seoRolloutTypes'
import SeoDistributionPilotPanel from '@/app/admin/ingestion/SeoDistributionPilotPanel'
import { useCallback, useEffect, useMemo, useState } from 'react'

const GATE_STYLE = {
  pass: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  fail: 'border-red-300 bg-red-50 text-red-950',
  pending: 'border-slate-300 bg-slate-50 text-slate-700',
  blocked: 'border-amber-300 bg-amber-50 text-amber-950',
} as const

type Props = {
  metrics: IngestionMetricsResponse
  coverage: YstmCoverageMetricsResponse | null
  publishedListingCount?: number
}

function parseRolloutState(body: {
  rolloutState?: {
    publicIndexingEnabled?: boolean
    publicIndexingEnabledAt?: string | null
    publicIndexingDisabledAt?: string | null
    crawlValidationPassed?: boolean
    crawlValidationPassedAt?: string | null
    searchConsoleValidationPassed?: boolean
    searchConsoleValidationPassedAt?: string | null
  }
}): SeoRolloutRuntimeState {
  const s = body.rolloutState
  if (!s) return SEO_ROLLOUT_DISABLED_STATE
  return {
    publicIndexingEnabled: s.publicIndexingEnabled === true,
    publicIndexingEnabledAt: s.publicIndexingEnabledAt ?? null,
    publicIndexingDisabledAt: s.publicIndexingDisabledAt ?? null,
    crawlValidationPassed: s.crawlValidationPassed === true,
    crawlValidationPassedAt: s.crawlValidationPassedAt ?? null,
    searchConsoleValidationPassed: s.searchConsoleValidationPassed === true,
    searchConsoleValidationPassedAt: s.searchConsoleValidationPassedAt ?? null,
  }
}

export default function SeoOperationalPanel({ metrics, coverage, publishedListingCount = 0 }: Props) {
  const [metros, setMetros] = useState<SeoMetro[]>([])
  const [inventoryBySlug, setInventoryBySlug] = useState<Record<string, SeoInventorySummary>>(
    () => emptyInventoryByMetroSlug()
  )
  const [inventoryStatus, setInventoryStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [rolloutState, setRolloutState] = useState<SeoRolloutRuntimeState>(SEO_ROLLOUT_DISABLED_STATE)
  const [rolloutStatus, setRolloutStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attestBusy, setAttestBusy] = useState<SeoRolloutAttestationTarget | null>(null)

  const loadRolloutState = useCallback(async () => {
    setRolloutStatus('loading')
    try {
      const res = await fetch('/api/admin/seo/rollout-state', { credentials: 'include' })
      const body = (await res.json()) as { ok: boolean; rolloutState?: SeoRolloutRuntimeState }
      if (!res.ok || !body.ok) throw new Error('Rollout state request failed')
      setRolloutState(parseRolloutState(body))
      setRolloutStatus('ready')
    } catch {
      setRolloutState(SEO_ROLLOUT_DISABLED_STATE)
      setRolloutStatus('error')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setInventoryStatus('loading')
    void loadRolloutState()
    fetch('/api/admin/seo/metro-inventory', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Metro inventory request failed')
        const body = (await res.json()) as {
          ok: boolean
          metros?: SeoMetro[]
          inventoryBySlug?: Record<string, SeoInventorySummary>
        }
        if (!body.ok || !body.metros || !body.inventoryBySlug) {
          throw new Error('Invalid metro inventory response')
        }
        if (!cancelled) {
          setMetros(body.metros)
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
  }, [loadRolloutState])

  const setAttestation = useCallback(
    async (target: SeoRolloutAttestationTarget, enabled: boolean) => {
      setAttestBusy(target)
      try {
        const res = await fetch('/api/admin/seo/rollout-state', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target, enabled }),
        })
        const body = (await res.json()) as { ok: boolean; rolloutState?: SeoRolloutRuntimeState }
        if (!res.ok || !body.ok) throw new Error('Attestation update failed')
        setRolloutState(parseRolloutState(body))
      } finally {
        setAttestBusy(null)
      }
    },
    []
  )

  const snapshot = useMemo(() => {
    const sitemapCounts = computeSeoSitemapCounts({
      totalPublishedListings: publishedListingCount,
      nationalIndexingAllowed: false,
      metros,
      inventoryBySlug,
      rolloutState,
    })
    const provisional = buildSeoOperationalSnapshot({
      metrics,
      coverage,
      sitemapCounts,
      metros,
      inventoryByMetroSlug: inventoryBySlug,
      rolloutState,
    })
    return buildSeoOperationalSnapshot({
      metrics,
      coverage,
      sitemapCounts: computeSeoSitemapCounts({
        totalPublishedListings: publishedListingCount,
        nationalIndexingAllowed: provisional.rollout.indexingAllowed,
        metros,
        inventoryBySlug,
        rolloutState,
      }),
      metros,
      inventoryByMetroSlug: inventoryBySlug,
      rolloutState,
    })
  }, [metrics, coverage, publishedListingCount, metros, inventoryBySlug, rolloutState])

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">SEO operational readiness</h2>
          <p className="mt-1 text-sm text-slate-600">
            Index allowlist derives from ingestion gates. Rollout attestations are stored in{' '}
            <code className="text-xs">ingestion_orchestration_state</code> (key{' '}
            <code className="text-xs">seo_rollout</code>). Metros are discovered nationwide from published
            inventory; participation is gated by operational thresholds only. Read-only diagnostics:{' '}
            <Link href="/admin/seo" className="font-medium text-purple-700 hover:text-purple-900">
              SEO Operations
            </Link>
            .
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
        {' · '}
        Rollout state:{' '}
        {rolloutStatus === 'loading'
          ? 'loading…'
          : rolloutStatus === 'error'
            ? 'unavailable (fail-closed)'
            : 'loaded'}
      </p>

      <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800">
        <p className="font-semibold text-slate-900">Index rollout controls (admin)</p>
        <p className="mt-1 text-xs text-slate-600">
          Enable only after operational allowlist is green. Disabling public indexing immediately restores{' '}
          <code className="text-xs">noindex</code> on the next request.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <RolloutToggle
            label="Public indexing"
            enabled={rolloutState.publicIndexingEnabled}
            busy={attestBusy === 'public_indexing'}
            onEnable={() => setAttestation('public_indexing', true)}
            onDisable={() => setAttestation('public_indexing', false)}
          />
          <RolloutToggle
            label="Crawl validation"
            enabled={rolloutState.crawlValidationPassed}
            busy={attestBusy === 'crawl_validation'}
            onEnable={() => setAttestation('crawl_validation', true)}
            onDisable={() => setAttestation('crawl_validation', false)}
          />
          <RolloutToggle
            label="Search Console"
            enabled={rolloutState.searchConsoleValidationPassed}
            busy={attestBusy === 'search_console'}
            onEnable={() => setAttestation('search_console', true)}
            onDisable={() => setAttestation('search_console', false)}
          />
        </div>
      </div>

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
        <MetricCard
          label="Participating metros"
          value={String(snapshot.metroParticipation.participatingMetroSlugs.length)}
        />
        <MetricCard label="Discovered metros" value={String(metros.length)} />
      </div>

      <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
        <p className="font-semibold text-slate-900">Phase 5 crawl smoke</p>
        <p className="mt-1 text-slate-600">
          Run{' '}
          <code className="text-xs">GET /api/admin/seo/crawl-smoke?metroSlug=dallas-tx&amp;saleId=…</code>{' '}
          then attest crawl validation above. See{' '}
          <code className="text-xs">docs/SEO_PHASE5_CRAWL_VALIDATION.md</code>.
        </p>
        {snapshot.rollout.qualifiedMetroSlugs.length > 0 && (
          <p className="mt-2 text-xs text-slate-600">
            Qualified for index rollout: {snapshot.rollout.qualifiedMetroSlugs.join(', ')}
          </p>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-900">Metro participation (nationwide)</p>
        <p className="mt-1 text-xs text-slate-600">
          Each metro with published inventory is scored against operational gates. No pilot or expansion
          allowlists — qualification alone controls index rollout and distribution eligibility.
        </p>
        <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
          {snapshot.metroParticipation.rows.map((row) => (
            <li
              key={row.slug}
              className={`rounded border px-3 py-2 text-xs ${
                row.qualified
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                  : 'border-slate-300 bg-slate-50 text-slate-700'
              }`}
            >
              <span className="font-semibold">{row.slug}</span> — score {row.score}
              {row.qualified ? ' (participating)' : ''}
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

      <SeoDistributionPilotPanel metros={metros} />

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

function RolloutToggle({
  label,
  enabled,
  busy,
  onEnable,
  onDisable,
}: {
  label: string
  enabled: boolean
  busy: boolean
  onEnable: () => void
  onDisable: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs">
      <span className="font-medium text-slate-800">{label}</span>
      <span className={enabled ? 'text-emerald-700' : 'text-slate-500'}>{enabled ? 'on' : 'off'}</span>
      <button
        type="button"
        disabled={busy || enabled}
        className="rounded bg-emerald-600 px-2 py-0.5 text-white disabled:opacity-40"
        onClick={() => onEnable()}
      >
        Enable
      </button>
      <button
        type="button"
        disabled={busy || !enabled}
        className="rounded bg-slate-600 px-2 py-0.5 text-white disabled:opacity-40"
        onClick={() => onDisable()}
      >
        Disable
      </button>
    </div>
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
