'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { copyTextToClipboard } from '@/lib/admin/copyTextToClipboard'
import { formatSeoDiagnosticsText } from '@/lib/seo/buildSeoOperationsDashboard'
import type { SeoOperationsDashboard } from '@/lib/seo/seoOperationsDashboardTypes'

const HEALTH_STYLE = {
  READY: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  ACTION_REQUIRED: 'border-amber-300 bg-amber-50 text-amber-950',
  BLOCKED: 'border-red-300 bg-red-50 text-red-950',
} as const

const GATE_STYLE = {
  pass: 'text-emerald-700',
  fail: 'text-red-700',
  off: 'text-slate-500',
} as const

type DashboardResponse = {
  ok: boolean
  dashboard?: SeoOperationsDashboard
  diagnosticsText?: string
  code?: string
  message?: string
}

export default function SeoOperationsDashboardClient() {
  const [dashboard, setDashboard] = useState<SeoOperationsDashboard | null>(null)
  const [diagnosticsText, setDiagnosticsText] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [crawlSmokeBusy, setCrawlSmokeBusy] = useState(false)
  const [copyBusy, setCopyBusy] = useState(false)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

  const loadDashboard = useCallback(async (options?: { runCrawlSmoke?: boolean }) => {
    if (!options?.runCrawlSmoke) {
      setStatus('loading')
    }
    setErrorMessage(null)
    try {
      const url = options?.runCrawlSmoke
        ? '/api/admin/seo/operations-dashboard?crawlSmoke=1'
        : '/api/admin/seo/operations-dashboard'
      const res = await fetch(url, { credentials: 'include' })
      const body = (await res.json()) as DashboardResponse
      if (!res.ok || !body.ok || !body.dashboard) {
        throw new Error(body.message ?? 'Failed to load SEO operations dashboard')
      }
      setDashboard(body.dashboard)
      setDiagnosticsText(body.diagnosticsText ?? formatSeoDiagnosticsText(body.dashboard))
      setStatus('ready')
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load dashboard')
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const runCrawlSmoke = useCallback(async () => {
    setCrawlSmokeBusy(true)
    try {
      await loadDashboard({ runCrawlSmoke: true })
    } finally {
      setCrawlSmokeBusy(false)
    }
  }, [loadDashboard])

  const copyDiagnostics = useCallback(async () => {
    if (!diagnosticsText) return
    setCopyBusy(true)
    setCopyMessage(null)
    try {
      await copyTextToClipboard(diagnosticsText)
      setCopyMessage('Copied to clipboard')
    } catch {
      setCopyMessage('Copy failed — select and copy manually')
    } finally {
      setCopyBusy(false)
    }
  }, [diagnosticsText])

  return (
    <div className="min-h-screen bg-slate-100 py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">SEO Operations</h1>
            <p className="mt-1 text-sm text-slate-600">
              Read-only visibility into crawl and index health. Rollout controls live on{' '}
              <Link href="/admin/ingestion" className="font-medium text-purple-700 hover:text-purple-900">
                Ingestion admin
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Refresh
            </button>
            <button
              type="button"
              disabled={copyBusy || !diagnosticsText}
              onClick={() => void copyDiagnostics()}
              className="rounded bg-purple-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-800 disabled:opacity-50"
            >
              Copy SEO Diagnostics
            </button>
          </div>
        </div>

        {copyMessage && <p className="mb-4 text-sm text-slate-600">{copyMessage}</p>}

        {status === 'loading' && (
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Loading SEO operations dashboard…
          </p>
        )}

        {status === 'error' && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-900">
            {errorMessage ?? 'Dashboard unavailable'}
          </p>
        )}

        {status === 'ready' && dashboard && (
          <div className="space-y-4">
            <section className={`rounded-lg border p-4 ${HEALTH_STYLE[dashboard.health]}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">SEO Health</p>
              <p className="mt-1 text-2xl font-bold">{dashboard.health}</p>
              {dashboard.blockers.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-semibold">Blockers</p>
                  <ul className="mt-1 list-inside list-disc text-sm">
                    {dashboard.blockers.map((blocker) => (
                      <li key={`${blocker.source}:${blocker.text}`}>
                        [{blocker.source}] {blocker.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Rollout Status">
                <RolloutRow
                  label="Public Indexing"
                  enabled={dashboard.rolloutState.publicIndexingEnabled}
                  at={dashboard.rolloutState.publicIndexingEnabledAt}
                />
                <RolloutRow
                  label="Crawl Validation"
                  enabled={dashboard.rolloutState.crawlValidationPassed}
                  at={dashboard.rolloutState.crawlValidationPassedAt}
                />
                <RolloutRow
                  label="Search Console"
                  enabled={dashboard.rolloutState.searchConsoleValidationPassed}
                  at={dashboard.rolloutState.searchConsoleValidationPassedAt}
                />
              </Card>

              <Card title="Canonical Domain">
                <Row label="Configured env" value={dashboard.canonical.configuredEnv ?? '(not set)'} />
                <Row label="Effective canonical" value={dashboard.canonical.effectiveCanonical} />
                {dashboard.canonical.usingFallback && (
                  <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-950">
                    WARNING: Fallback canonical in use ({dashboard.canonical.fallbackUrl})
                  </p>
                )}
              </Card>
            </div>

            <Card title="SEO Enablement">
              <p className="mb-2 text-xs text-slate-600">
                {dashboard.snapshot.enablement.readyForIndexing
                  ? 'SEO_READY_FOR_INDEXING'
                  : dashboard.snapshot.enablement.metricGatePass
                    ? 'Metric gate pass — awaiting attestations'
                    : 'Metric gate blocked'}
              </p>
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm text-slate-700">
                {dashboard.snapshot.enablement.gates.map((gate) => (
                  <li key={gate.id} className="flex flex-wrap gap-2">
                    <span className={`font-semibold uppercase ${gateStatusClass(gate.status)}`}>
                      {gate.status}
                    </span>
                    <span className="text-slate-500">[{gate.source}]</span>
                    <span>{gate.label}</span>
                    <span className="text-slate-500">— {gate.detail}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="YSTM Stabilization (display only)">
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm text-slate-700">
                {dashboard.snapshot.allowlist.gates.map((gate) => (
                  <li key={gate.id} className="flex flex-wrap gap-2">
                    <span className={`font-semibold uppercase ${gateStatusClass(gate.status)}`}>
                      {gate.status}
                    </span>
                    <span className="text-slate-500">[{gate.source}]</span>
                    <span>{gate.label}</span>
                    <span className="text-slate-500">— {gate.detail}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Indexability">
                <Row label="Listings" value={dashboard.indexability.listings} />
                <Row
                  label="Metro Pages"
                  value={`${dashboard.indexability.qualifiedMetroCount} qualified → INDEX · ${dashboard.indexability.blockedMetroCount} blocked → NOINDEX`}
                />
                <Row label="Weekend Pages" value="Same qualification as Metro Pages" />
                <Row label="Default directive" value={dashboard.indexability.defaultDirective} />
              </Card>

              <Card title="Sitemap Diagnostics">
                <Row label="Sitemap URL" value={dashboard.sitemap.sitemapUrl} />
                <Row
                  label="Indexing enabled"
                  value={dashboard.sitemap.indexingEnabled ? 'yes' : 'no'}
                />
                <Row label="Segments" value={dashboard.sitemap.segments.join(', ')} />
                <Row label="Static URLs" value={String(dashboard.sitemap.staticUrlCount)} />
                <Row label="Listing URLs" value={String(dashboard.sitemap.listingUrlCount)} />
                <Row label="Qualified metro URLs" value={String(dashboard.sitemap.cityUrlCount)} />
                <Row label="Weekend URLs" value={String(dashboard.sitemap.weekendUrlCount)} />
              </Card>

              <Card title="SEO Infrastructure">
                <Row
                  label="Enablement snapshot age"
                  value={
                    dashboard.infrastructure.enablementSnapshotAgeMinutes == null
                      ? 'n/a'
                      : `${dashboard.infrastructure.enablementSnapshotAgeMinutes} min`
                  }
                />
                <Row
                  label="Qualified metro snapshot age"
                  value={
                    dashboard.infrastructure.qualifiedMetroSnapshotAgeMinutes == null
                      ? 'n/a'
                      : `${dashboard.infrastructure.qualifiedMetroSnapshotAgeMinutes} min`
                  }
                />
                <Row
                  label="Inventory snapshot age"
                  value={
                    dashboard.infrastructure.inventorySnapshotAgeMinutes == null
                      ? 'n/a'
                      : `${dashboard.infrastructure.inventorySnapshotAgeMinutes} min`
                  }
                />
                <Row
                  label="Metro inventory snapshot age"
                  value={
                    dashboard.infrastructure.metroInventorySnapshotAgeMinutes == null
                      ? 'n/a'
                      : `${dashboard.infrastructure.metroInventorySnapshotAgeMinutes} min`
                  }
                />
                <Row
                  label="Qualified metros (snapshot)"
                  value={String(dashboard.infrastructure.qualifiedMetroCount)}
                />
                <Row
                  label="Sitemap inventory count"
                  value={String(dashboard.infrastructure.sitemapInventoryCount)}
                />
                <Row
                  label="Metro inventory count"
                  value={String(dashboard.infrastructure.metroInventoryCount)}
                />
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Listing Footprint">
                <Row label="Published" value={String(dashboard.listingFootprint.published)} />
                <Row label="Indexable" value={String(dashboard.listingFootprint.indexable)} />
                <Row label="Noindex" value={String(dashboard.listingFootprint.noindex)} />
              </Card>

              <Card title="Internal Link Graph (sample)">
                <Row label="Sample" value={dashboard.internalLinks.label} />
                <Row
                  label="Listings → City links"
                  value={String(dashboard.internalLinks.listingsWithCityLink)}
                />
                <Row
                  label="Listings → Weekend links"
                  value={String(dashboard.internalLinks.listingsWithWeekendLink)}
                />
                <Row
                  label="Nearby sale links"
                  value={String(dashboard.internalLinks.nearbySaleLinks)}
                />
              </Card>
            </div>

            <Card title="Crawl Smoke">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={crawlSmokeBusy}
                  onClick={() => void runCrawlSmoke()}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  {crawlSmokeBusy ? 'Running…' : 'Run crawl smoke'}
                </button>
                {dashboard.rolloutState.crawlValidationPassedAt && (
                  <span className="text-xs text-slate-600">
                    Last attested: {dashboard.rolloutState.crawlValidationPassedAt}
                  </span>
                )}
              </div>
              {dashboard.crawlSmoke ? (
                <div className="mt-3">
                  <p
                    className={`text-sm font-semibold ${dashboard.crawlSmoke.passed ? 'text-emerald-800' : 'text-red-800'}`}
                  >
                    {dashboard.crawlSmoke.passed ? 'PASS' : 'FAIL'} — run at{' '}
                    {dashboard.crawlSmoke.generatedAt}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-700">
                    {dashboard.crawlSmoke.checks
                      .filter((check) => !check.pass)
                      .map((check) => (
                        <li key={check.id}>
                          {check.label}: {check.detail}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  Not run yet. Use Run crawl smoke to execute live HTML checks.
                </p>
              )}
            </Card>

            <Card title="Metro Coverage">
              <div className="mb-3 grid gap-2 text-sm sm:grid-cols-3">
                <Metric label="Total metros" value={dashboard.indexability.totalMetroCount} />
                <Metric label="Qualified" value={dashboard.indexability.qualifiedMetroCount} />
                <Metric label="Blocked" value={dashboard.indexability.blockedMetroCount} />
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-2 font-medium">Metro</th>
                      <th className="py-2 pr-2 font-medium">Status</th>
                      <th className="py-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.snapshot.metroParticipation.rows.map((row) => (
                      <tr key={row.slug} className="border-b border-slate-100">
                        <td className="py-2 pr-2 font-medium text-slate-900">{row.slug}</td>
                        <td className="py-2 pr-2">
                          {row.qualified ? (
                            <span className="text-emerald-700">Qualified</span>
                          ) : (
                            <span className="text-amber-700">Blocked</span>
                          )}
                        </td>
                        <td className="py-2 text-slate-600">
                          {row.reasons.length > 0 ? row.reasons.join('; ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  )
}

function RolloutRow({
  label,
  enabled,
  at,
}: {
  label: string
  enabled: boolean
  at: string | null
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-slate-700">{label}</span>
      <span className={enabled ? GATE_STYLE.pass : GATE_STYLE.off}>
        {enabled ? '✓' : '✗'}
        {at ? ` (${new Date(at).toLocaleString()})` : ''}
      </span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function gateStatusClass(status: string): string {
  if (status === 'pass') return GATE_STYLE.pass
  if (status === 'fail') return GATE_STYLE.fail
  return GATE_STYLE.off
}
