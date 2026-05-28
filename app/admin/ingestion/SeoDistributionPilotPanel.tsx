'use client'

import { SEO_DISTRIBUTION_SURFACES } from '@/lib/seo/distribution/surfaces'
import type { SeoDistributionPack, SeoDistributionSurfaceId } from '@/lib/seo/distribution/types'
import { getSeoMetroBySlug } from '@/lib/seo/metroCatalog'
import { useCallback, useMemo, useState } from 'react'

type Props = {
  nationalIndexingAllowed: boolean
  activeMetroSlugs: string[]
}

export default function SeoDistributionPilotPanel({
  nationalIndexingAllowed,
  activeMetroSlugs,
}: Props) {
  const metros = useMemo(
    () =>
      activeMetroSlugs
        .map((slug) => getSeoMetroBySlug(slug))
        .filter((m): m is NonNullable<typeof m> => m != null),
    [activeMetroSlugs]
  )
  const [metroSlug, setMetroSlug] = useState(metros[0]?.slug ?? 'dallas-tx')
  const [surface, setSurface] = useState<SeoDistributionSurfaceId>('reddit_weekend')
  const [pack, setPack] = useState<SeoDistributionPack | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')

  const loadPack = useCallback(async () => {
    setStatus('loading')
    setPack(null)
    try {
      const params = new URLSearchParams({
        metroSlug,
        surface,
        nationalIndexingAllowed: nationalIndexingAllowed ? 'true' : 'false',
      })
      const res = await fetch(`/api/admin/seo/distribution-pack?${params}`, {
        credentials: 'include',
      })
      const body = (await res.json()) as { ok: boolean; pack?: SeoDistributionPack; message?: string }
      if (!res.ok || !body.ok || !body.pack) {
        throw new Error(body.message ?? 'Failed to load distribution pack')
      }
      setPack(body.pack)
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }, [metroSlug, surface, nationalIndexingAllowed])

  const copyPack = useCallback(async () => {
    if (!pack?.eligible) return
    const text = `${pack.title}\n\n${pack.body}`
    await navigator.clipboard.writeText(text)
    setCopyState('copied')
    setTimeout(() => setCopyState('idle'), 2000)
  }, [pack])

  return (
    <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800">
      <p className="font-semibold text-slate-900">Phase 7 — local discovery distribution (manual)</p>
      <p className="mt-1 text-xs text-slate-600">
        Generates copy from live inventory for human review. No automated posting. See{' '}
        <code className="text-xs">docs/SEO_PHASE7_LOCAL_DISCOVERY_DISTRIBUTION.md</code>.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <label className="flex flex-col text-xs text-slate-600">
          Metro
          <select
            className="mt-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
            value={metroSlug}
            onChange={(e) => setMetroSlug(e.target.value)}
          >
            {metros.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.slug}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-600">
          Channel
          <select
            className="mt-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
            value={surface}
            onChange={(e) => setSurface(e.target.value as SeoDistributionSurfaceId)}
          >
            {SEO_DISTRIBUTION_SURFACES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => void loadPack()}
            disabled={status === 'loading'}
            className="rounded border border-indigo-400 bg-white px-3 py-1.5 text-xs font-medium text-indigo-900 hover:bg-indigo-50 disabled:opacity-50"
          >
            {status === 'loading' ? 'Generating…' : 'Generate pack'}
          </button>
          <button
            type="button"
            onClick={() => void copyPack()}
            disabled={!pack?.eligible}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          >
            {copyState === 'copied' ? 'Copied' : 'Copy for paste'}
          </button>
        </div>
      </div>

      {status === 'error' && (
        <p className="mt-2 text-xs text-red-700">Could not generate distribution pack.</p>
      )}

      {pack && !pack.eligible && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-950">
          <p className="font-semibold">Not eligible for distribution</p>
          <ul className="mt-1 list-inside list-disc">
            {pack.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {pack?.eligible && (
        <div className="mt-3 space-y-2">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 text-xs text-slate-800">
            {pack.title}
            {'\n\n'}
            {pack.body}
          </pre>
          <ul className="text-xs text-slate-600">
            {pack.links.map((link) => (
              <li key={link.url}>
                <span className="font-medium">{link.label}:</span> {link.url}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
