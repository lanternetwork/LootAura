'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { copyTextToClipboard } from '@/lib/admin/copyTextToClipboard'
import type { SocialCityReport, SocialMetroOption } from '@/lib/admin/social/socialCityReportTypes'
import SocialReportMap from './SocialReportMap'

type MetrosResponse = {
  ok: boolean
  metros?: SocialMetroOption[]
  message?: string
}

type ReportResponse = {
  ok: boolean
  report?: SocialCityReport
  code?: string
  message?: string
}

export default function SocialCityReportClient() {
  const [metros, setMetros] = useState<SocialMetroOption[]>([])
  const [metrosStatus, setMetrosStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [metrosError, setMetrosError] = useState<string | null>(null)

  const [selectedSlug, setSelectedSlug] = useState('')
  const [search, setSearch] = useState('')
  const [report, setReport] = useState<SocialCityReport | null>(null)
  const [reportStatus, setReportStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [reportError, setReportError] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadMetros() {
      setMetrosStatus('loading')
      setMetrosError(null)
      try {
        const res = await fetch('/api/admin/social/metros', { credentials: 'include' })
        const body = (await res.json()) as MetrosResponse
        if (!res.ok || !body.ok || !body.metros) {
          throw new Error(body.message ?? 'Failed to load metro catalog')
        }
        if (!cancelled) {
          setMetros(body.metros)
          setMetrosStatus('ready')
        }
      } catch (error) {
        if (!cancelled) {
          setMetrosStatus('error')
          setMetrosError(error instanceof Error ? error.message : 'Failed to load metros')
        }
      }
    }
    void loadMetros()
    return () => {
      cancelled = true
    }
  }, [])

  const loadReport = useCallback(async (citySlug: string) => {
    if (!citySlug) return
    setReportStatus('loading')
    setReportError(null)
    try {
      const res = await fetch(
        `/api/admin/social/report?citySlug=${encodeURIComponent(citySlug)}`,
        { credentials: 'include' }
      )
      const body = (await res.json()) as ReportResponse
      if (!res.ok || !body.ok || !body.report) {
        throw new Error(body.message ?? 'Failed to load report')
      }
      setReport(body.report)
      setReportStatus('ready')
    } catch (error) {
      setReportStatus('error')
      setReportError(error instanceof Error ? error.message : 'Failed to load report')
      setReport(null)
    }
  }, [])

  useEffect(() => {
    if (!selectedSlug) {
      setReport(null)
      setReportStatus('idle')
      return
    }
    void loadReport(selectedSlug)
  }, [selectedSlug, loadReport])

  const filteredMetros = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return metros
    return metros.filter(
      (metro) =>
        metro.label.toLowerCase().includes(query) ||
        metro.slug.toLowerCase().includes(query)
    )
  }, [metros, search])

  const handleCopyCaption = useCallback(async () => {
    if (!report?.caption) return
    setCopyMessage(null)
    try {
      await copyTextToClipboard(report.caption)
      setCopyMessage('Caption copied')
    } catch {
      setCopyMessage('Copy failed — select and copy manually')
    }
  }, [report?.caption])

  return (
    <div className="min-h-screen bg-slate-200 py-8">
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Social City Report</h1>
            <p className="mt-1 text-sm text-slate-600">
              Screenshot-ready weekend reports for social posts.{' '}
              <Link href="/admin/seo" className="font-medium text-purple-700 hover:text-purple-900">
                SEO ops
              </Link>
              {' · '}
              <Link href="/admin/ingestion" className="font-medium text-purple-700 hover:text-purple-900">
                Ingestion
              </Link>
            </p>
          </div>
          {selectedSlug && reportStatus === 'ready' && (
            <button
              type="button"
              onClick={() => void loadReport(selectedSlug)}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Refresh report
            </button>
          )}
        </div>

        <div className="mb-6 rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
          <label htmlFor="city-search" className="block text-sm font-semibold text-slate-800">
            Select City
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="city-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search cities…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 sm:max-w-xs"
              disabled={metrosStatus !== 'ready'}
            />
            <select
              value={selectedSlug}
              onChange={(event) => setSelectedSlug(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 sm:flex-1"
              disabled={metrosStatus !== 'ready'}
            >
              <option value="">Choose a city…</option>
              {filteredMetros.map((metro) => (
                <option key={metro.slug} value={metro.slug}>
                  {metro.label}
                </option>
              ))}
            </select>
          </div>
          {metrosStatus === 'loading' && (
            <p className="mt-2 text-sm text-slate-500">Loading metro catalog…</p>
          )}
          {metrosStatus === 'error' && (
            <p className="mt-2 text-sm text-red-700">{metrosError}</p>
          )}
        </div>

        {!selectedSlug && (
          <div className="rounded-lg border border-dashed border-slate-400 bg-white/70 p-12 text-center">
            <p className="text-lg font-medium text-slate-700">Select a city to generate a report</p>
            <p className="mt-2 text-sm text-slate-500">
              Reports use live weekend inventory — no default city to avoid stale screenshots.
            </p>
          </div>
        )}

        {selectedSlug && reportStatus === 'loading' && (
          <div className="rounded-lg border border-slate-300 bg-white p-12 text-center text-slate-600">
            Loading report…
          </div>
        )}

        {selectedSlug && reportStatus === 'error' && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-6 text-red-800">
            {reportError}
          </div>
        )}

        {report && reportStatus === 'ready' && (
          <div
            data-testid="social-city-report"
            className="overflow-hidden rounded-2xl border border-slate-300 bg-gradient-to-br from-white via-purple-50/40 to-indigo-50/60 shadow-lg"
          >
            <div className="grid min-h-[720px] grid-cols-12 gap-0">
              <div className="col-span-12 border-b border-slate-200/80 bg-white/80 px-10 py-8 lg:col-span-5 lg:border-b-0 lg:border-r">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-purple-700">
                  {report.city}, {report.state}
                </p>
                <h2 className="mt-2 text-4xl font-black leading-tight text-slate-900">
                  Weekend Sale Report
                </h2>
                <p className="mt-3 text-xl font-medium text-slate-700">{report.heroDateRange}</p>

                <div className="mt-10 rounded-2xl bg-purple-700 px-6 py-8 text-white shadow-md">
                  <p className="text-6xl font-black leading-none">#{report.cityRank}</p>
                  <p className="mt-3 text-lg font-semibold">Most Active City</p>
                  <p className="text-base text-purple-100">This Weekend</p>
                </div>

                <div className="mt-10">
                  <p className="text-5xl font-black text-slate-900">
                    {report.activeSales.toLocaleString('en-US')}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-700">Active Sales</p>
                </div>
              </div>

              <div className="col-span-12 flex flex-col px-10 py-8 lg:col-span-7">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Map Preview
                  </p>
                  <SocialReportMap mapPins={report.mapPins} />
                </div>

                <div className="mt-6 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Caption
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCopyCaption()}
                      className="rounded bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-900"
                    >
                      Copy caption
                    </button>
                  </div>
                  {copyMessage && (
                    <p className="mt-1 text-xs text-emerald-700">{copyMessage}</p>
                  )}
                  <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white/90 p-4 font-sans text-base leading-relaxed text-slate-800">
                    {report.caption}
                  </pre>
                </div>

                <div className="mt-6 border-t border-slate-200 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Updated
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm font-medium text-slate-700">
                    {report.timestampLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
