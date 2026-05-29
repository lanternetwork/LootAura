'use client'

import { SEO_DISTRIBUTION_SURFACES } from '@/lib/seo/distribution/surfaces'
import type { SeoDistributionPack, SeoDistributionSurfaceId } from '@/lib/seo/distribution/types'
import type { SeoMetro } from '@/lib/seo/types'
import { useCallback, useEffect, useState } from 'react'

type Props = {
  metros: SeoMetro[]
}

export default function SeoDistributionPilotPanel({ metros }: Props) {
  const [metroSlug, setMetroSlug] = useState(metros[0]?.slug ?? '')
  const [surface, setSurface] = useState<SeoDistributionSurfaceId>('reddit_weekend')
  const [pack, setPack] = useState<SeoDistributionPack | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')

  useEffect(() => {
    if (!metroSlug && metros[0]?.slug) {
      setMetroSlug(metros[0].slug)
    }
  }, [metros, metroSlug])

  const loadPack = useCallback(async () => {
    if (!metroSlug) return
    setStatus('loading')
    setPack(null)
    try {
      const params = new URLSearchParams({
        metroSlug,
        surface,
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
  }, [metroSlug, surface])

  const copyPack = useCallback(async () => {
    if (!pack?.eligible) return
    const text = `${pack.title}\n\n${pack.body}`
    await navigator.clipboard.writeText(text)
    setCopyState('copied')
    setTimeout(() => setCopyState('idle'), 2000)
  }, [pack])

  if (metros.length === 0) {
    return null
  }

  return (
    <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800">
      <p className="font-semibold text-slate-900">Phase 7 — local discovery distribution (manual)</p>
      <p className="mt-1 text-xs text-slate-600">
        Generates copy from live inventory for human review. No automated posting. Eligibility follows the
        same operational gates as SEO index rollout.
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
        <button
          type="button"
          className="self-end rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
          disabled={!metroSlug || status === 'loading'}
          onClick={() => void loadPack()}
        >
          {status === 'loading' ? 'Loading…' : 'Generate pack'}
        </button>
      </div>

      {status === 'error' && (
        <p className="mt-2 text-xs text-red-700">Failed to load distribution pack.</p>
      )}

      {pack && (
        <div className="mt-3 rounded border border-slate-300 bg-white p-3 text-xs">
          <p className="font-semibold text-slate-900">
            {pack.eligible ? 'Eligible' : 'Blocked'} — score {pack.score}
          </p>
          {!pack.eligible && pack.blockers.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-slate-600">
              {pack.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 font-medium text-slate-800">{pack.title}</p>
          <pre className="mt-2 whitespace-pre-wrap text-slate-700">{pack.body}</pre>
          {pack.links.length > 0 && (
            <ul className="mt-2 space-y-1 text-slate-600">
              {pack.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-purple-700 hover:underline">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="mt-3 rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
            disabled={!pack.eligible}
            onClick={() => void copyPack()}
          >
            {copyState === 'copied' ? 'Copied' : 'Copy pack'}
          </button>
        </div>
      )}
    </div>
  )
}
