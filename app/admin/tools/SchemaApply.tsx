'use client'

import { useState } from 'react'

type Step = {
  name: string
  label: string
}

const STEPS: Step[] = [
  { name: '032_create_lootaura_v2_schema.sql', label: 'Create v2 schema' },
  { name: '033_safe_lootaura_v2_schema.sql', label: 'Safe v2 schema fixes' },
  { name: '034_public_v2_wrappers.sql', label: 'Public views & RPC' },
  { name: '035_test_data_seed.sql', label: 'Seed test data (optional)' },
]

export default function SchemaApply() {
  const [token, setToken] = useState('')
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [results, setResults] = useState<Record<string, boolean>>({})

  function log(line: string) {
    setLogs(prev => [...prev, line])
  }

  async function run() {
    setRunning(true)
    setLogs([])
    setResults({})
    try {
      for (const step of STEPS) {
        log(`▶ ${step.label} (${step.name})`)
        const res = await fetch('/api/run-simple-migration', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ name: step.name }),
        })
        const ok = res.ok
        let body: any = null
        try { body = await res.json() } catch {}
        setResults(prev => ({ ...prev, [step.name]: ok }))
        log(`${ok ? '✔' : '✖'} ${step.label}${ok ? '' : `: ${body?.error || res.statusText}`}`)
        if (!ok) break
      }
    } catch (e: any) {
      log(`✖ Error: ${e?.message || String(e)}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-700">
        Run the v2 schema migrations (idempotent). Requires admin token.
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="password"
          placeholder="SEED_TOKEN"
          className="border rounded px-3 py-2 text-sm w-full sm:w-64"
          value={token}
          onChange={e => setToken(e.target.value)}
        />
        <button
          onClick={run}
          disabled={running || !token}
          className="rounded bg-emerald-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {running ? 'Applying...' : 'Apply v2 schema'}
        </button>
      </div>
      <div className="text-xs text-neutral-600">
        Steps:
        <ul className="list-disc pl-5 mt-1">
          {STEPS.map(s => (
            <li key={s.name}>
              {s.label} <span className="text-neutral-400">({s.name})</span>
              {results[s.name] === true && <span className="ml-2 text-emerald-700">✔</span>}
              {results[s.name] === false && <span className="ml-2 text-red-700">✖</span>}
            </li>
          ))}
        </ul>
      </div>
      {logs.length > 0 && (
        <pre className="mt-2 whitespace-pre-wrap rounded border bg-neutral-50 p-2 text-xs text-neutral-800 max-h-64 overflow-auto">
          {logs.join('\n')}
        </pre>
      )}
    </div>
  )
}


