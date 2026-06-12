'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { copyTextToClipboard } from '@/lib/admin/copyTextToClipboard'
import {
  DEFAULT_SOCIAL_REPORT_FORMAT,
  getSocialReportFormat,
  listSocialReportFormatOptions,
  type SocialReportFormatSlug,
} from '@/lib/admin/social/socialReportFormats'
import type { SocialCityReport, SocialMetroOption } from '@/lib/admin/social/socialCityReportTypes'
import {
  exportSocialReportCanvasToPng,
  SocialReportPngExportError,
} from '@/lib/admin/social/exportSocialReportCanvasToPng'
import SocialReportCanvas from './SocialReportCanvas'

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

const FORMAT_OPTIONS = listSocialReportFormatOptions()

export default function SocialCityReportClient() {
  const [metros, setMetros] = useState<SocialMetroOption[]>([])
  const [metrosStatus, setMetrosStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [metrosError, setMetrosError] = useState<string | null>(null)

  const [selectedSlug, setSelectedSlug] = useState('')
  const [selectedFormat, setSelectedFormat] = useState<SocialReportFormatSlug>(
    DEFAULT_SOCIAL_REPORT_FORMAT
  )
  const [search, setSearch] = useState('')
  const [report, setReport] = useState<SocialCityReport | null>(null)
  const [reportStatus, setReportStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [reportError, setReportError] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const [mapIdle, setMapIdle] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const formatDefinition = getSocialReportFormat(selectedFormat)

  const handleMapIdle = useCallback(() => {
    setMapIdle(true)
  }, [])

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

  const loadReport = useCallback(async (citySlug: string, format: SocialReportFormatSlug) => {
    if (!citySlug) return
    setReportStatus('loading')
    setReportError(null)
    setMapIdle(false)
    setExportError(null)
    try {
      const res = await fetch(
        `/api/admin/social/report?citySlug=${encodeURIComponent(citySlug)}&format=${encodeURIComponent(format)}`,
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
    void loadReport(selectedSlug, selectedFormat)
  }, [selectedSlug, selectedFormat, loadReport])

  const filteredMetros = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return metros
    return metros.filter(
      (metro) =>
        metro.label.toLowerCase().includes(query) ||
        metro.slug.toLowerCase().includes(query)
    )
  }, [metros, search])

  const handleDownloadPng = useCallback(async () => {
    if (!report) return
    setExportError(null)
    setIsExporting(true)
    try {
      await exportSocialReportCanvasToPng({
        citySlug: report.citySlug,
        formatSlug: selectedFormat,
      })
    } catch (error) {
      if (error instanceof SocialReportPngExportError) {
        setExportError(error.message)
      } else {
        setExportError('PNG export failed. Refresh the report and try again.')
      }
    } finally {
      setIsExporting(false)
    }
  }, [report, selectedFormat])

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
      <div className="mx-auto max-w-4xl px-6">
        <section aria-label="Admin controls" className="mb-8 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Social City Report</h1>
              <p className="mt-1 text-sm text-slate-600">
                Select a city and format, download a PNG or screenshot the canvas below, then post.{' '}
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
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownloadPng()}
                  disabled={!mapIdle || isExporting}
                  className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isExporting ? 'Exporting…' : 'Download PNG'}
                </button>
                <button
                  type="button"
                  onClick={() => void loadReport(selectedSlug, selectedFormat)}
                  disabled={isExporting}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Refresh report
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
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
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 sm:max-w-xs"
                disabled={metrosStatus !== 'ready'}
              />
              <select
                value={selectedSlug}
                onChange={(event) => setSelectedSlug(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 sm:flex-1"
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
            <label htmlFor="report-format" className="mt-4 block text-sm font-semibold text-slate-800">
              Format
            </label>
            <select
              id="report-format"
              value={selectedFormat}
              onChange={(event) =>
                setSelectedFormat(event.target.value as SocialReportFormatSlug)
              }
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 sm:max-w-md"
            >
              {FORMAT_OPTIONS.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </select>
            {metrosStatus === 'loading' && (
              <p className="mt-2 text-sm text-slate-500">Loading metro catalog…</p>
            )}
            {metrosStatus === 'error' && (
              <p className="mt-2 text-sm text-red-700">{metrosError}</p>
            )}
            {exportError && (
              <p className="mt-2 text-sm text-red-700" role="alert">
                {exportError}
              </p>
            )}
          </div>
        </section>

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
      </div>

      {report && reportStatus === 'ready' && (
        <>
          <section aria-label="Screenshot canvas" className="mb-8 w-full">
            <div className="mx-auto max-w-4xl px-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Screenshot the canvas below ({formatDefinition.canvasWidth}×
                {formatDefinition.canvasHeight})
              </p>
            </div>
            <div className="w-full overflow-x-auto">
              <div className="flex justify-center px-6 py-4">
                <SocialReportCanvas
                  key={`${report.citySlug}-${selectedFormat}`}
                  report={report}
                  format={selectedFormat}
                  onMapIdle={handleMapIdle}
                />
              </div>
            </div>
          </section>

          <div className="mx-auto max-w-4xl px-6">
            <section
              aria-label="Caption utility"
              className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">Post caption</h2>
                  <p className="text-xs text-slate-500">
                    For copy/paste when posting — not part of the screenshot.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyCaption()}
                  className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                >
                  Copy caption
                </button>
              </div>
              {copyMessage && (
                <p className="mt-2 text-xs text-emerald-700">{copyMessage}</p>
              )}
              <pre className="mt-3 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 font-sans text-sm leading-relaxed text-slate-700">
                {report.caption}
              </pre>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
