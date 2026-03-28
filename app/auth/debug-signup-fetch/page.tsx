'use client'

/**
 * TEMPORARY DEBUG: raw browser fetch to GoTrue /auth/v1/signup (no supabase-js).
 * Remove after BUG-002 isolation. Anon key is already public via NEXT_PUBLIC_*.
 */
import { useState } from 'react'
import Link from 'next/link'

const DEBUG_PASSWORD = 'Test123456!'

export default function DebugSignupFetchPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function runRawFetch() {
    setLoading(true)
    setResult(null)
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!baseUrl || !anon) {
        setResult(JSON.stringify({ error: 'Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY' }, null, 2))
        return
      }
      const email = `debug4+${Date.now()}@gmail.com`
      const signupUrl = `${baseUrl}/auth/v1/signup`
      const res = await fetch(signupUrl, {
        method: 'POST',
        headers: {
          apikey: anon,
          Authorization: `Bearer ${anon}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password: DEBUG_PASSWORD,
        }),
      })
      const text = await res.text()
      let body: unknown
      try {
        body = JSON.parse(text) as unknown
      } catch {
        body = { rawText: text.slice(0, 2000) }
      }
      setResult(
        JSON.stringify(
          {
            keyType: 'anon',
            email,
            requestUrl: signupUrl,
            httpStatus: res.status,
            ok: res.ok,
            body,
          },
          null,
          2
        )
      )
    } catch (e) {
      setResult(
        JSON.stringify(
          { error: e instanceof Error ? e.message : String(e) },
          null,
          2
        )
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-xl font-bold">DEBUG: Raw browser → /auth/v1/signup</h1>
        <p className="text-sm text-neutral-600">
          Bypasses supabase-js. Fresh email per run:{' '}
          <code className="text-xs">debug4+&lt;timestamp&gt;@gmail.com</code>
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void runRawFetch()}
          className="rounded bg-amber-500 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Running…' : 'Run raw fetch'}
        </button>
        <pre className="text-xs bg-white border rounded p-4 overflow-auto whitespace-pre-wrap">
          {result ?? 'Click button to run.'}
        </pre>
        <Link href="/auth/signup" className="text-amber-600 text-sm">
          ← Back to signup
        </Link>
      </div>
    </div>
  )
}
