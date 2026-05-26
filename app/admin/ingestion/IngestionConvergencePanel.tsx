'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  formatDuplicateCanonicalClustersClipboard,
  type DuplicateCanonicalPublishCluster,
} from '@/lib/admin/duplicateCanonicalPublishClusters'
import { copyTextToClipboard } from '@/lib/admin/copyTextToClipboard'

type ClustersResponse = {
  ok: boolean
  generatedAt?: string
  clusterCount?: number
  clusters?: DuplicateCanonicalPublishCluster[]
  message?: string
}

export default function IngestionConvergencePanel() {
  const [clusters, setClusters] = useState<DuplicateCanonicalPublishCluster[]>([])
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/ingestion/duplicate-canonical-clusters?limit=50', {
        credentials: 'include',
      })
      const json = (await res.json()) as ClustersResponse
      if (!res.ok || !json.ok || !json.clusters) {
        throw new Error(json.message || `HTTP ${res.status}`)
      }
      setClusters(json.clusters)
      setGeneratedAt(json.generatedAt ?? null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const copyClusters = useCallback(async () => {
    if (!generatedAt || clusters.length === 0) return
    try {
      await copyTextToClipboard(
        formatDuplicateCanonicalClustersClipboard(clusters, generatedAt)
      )
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 4000)
    }
  }, [clusters, generatedAt])

  return (
    <section className="rounded-lg border border-fuchsia-300 bg-fuchsia-50/60 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-fuchsia-950">
            Duplicate canonical publish clusters (Workstream A)
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-fuchsia-900">
            Canonical keys with more than one published sale. Remediate in Controls / ops — keep one
            published sale per cluster.
          </p>
          {generatedAt && (
            <p className="mt-1 text-xs text-fuchsia-800">
              Loaded {new Date(generatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyClusters()}
            disabled={loading || clusters.length === 0}
            className="rounded-md border border-fuchsia-600 bg-white px-3 py-1.5 text-sm font-medium text-fuchsia-900 hover:bg-fuchsia-100 disabled:opacity-50"
          >
            {copyState === 'copied'
              ? 'Copied'
              : copyState === 'error'
                ? 'Copy failed'
                : 'Copy cluster list'}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md border border-fuchsia-600 bg-white px-3 py-1.5 text-sm font-medium text-fuchsia-900 hover:bg-fuchsia-100 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh clusters'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {!loading && !error && clusters.length === 0 && (
        <p className="mt-3 text-sm font-medium text-emerald-900">
          No duplicate canonical publish clusters detected.
        </p>
      )}

      {!loading && clusters.length > 0 && (
        <div className="mt-4 space-y-4">
          {clusters.map((cluster) => (
            <div
              key={cluster.canonicalSaleInstanceKey}
              className="rounded-md border border-fuchsia-200 bg-white p-4 text-sm"
            >
              <p className="font-mono text-xs text-fuchsia-950 break-all">
                {cluster.canonicalSaleInstanceKey}
              </p>
              <p className="mt-1 text-xs text-fuchsia-800">
                {cluster.publishedSaleCount} published sale(s) · {cluster.rows.length} ingested row(s)
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-fuchsia-100 text-fuchsia-900">
                      <th className="py-1 pr-3 font-medium">Published sale</th>
                      <th className="py-1 pr-3 font-medium">Ingested id</th>
                      <th className="py-1 pr-3 font-medium">Platform</th>
                      <th className="py-1 pr-3 font-medium">Location</th>
                      <th className="py-1 font-medium">Source URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cluster.rows.map((row) => (
                      <tr key={row.ingestedSaleId} className="border-b border-fuchsia-50">
                        <td className="py-1 pr-3 font-mono">{row.publishedSaleId.slice(0, 8)}…</td>
                        <td className="py-1 pr-3 font-mono">{row.ingestedSaleId.slice(0, 8)}…</td>
                        <td className="py-1 pr-3">{row.sourcePlatform}</td>
                        <td className="py-1 pr-3">
                          {[row.city, row.state].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="py-1 max-w-xs truncate font-mono" title={row.sourceUrl}>
                          {row.sourceUrl || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
