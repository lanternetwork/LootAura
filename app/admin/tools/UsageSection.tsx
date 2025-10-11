'use client'

import React from 'react'
import CopyButton from './CopyButton'
import { getUsageSnapshot, resetUsage } from '@/lib/usageLogs'

export default function UsageSection({ enabled }: { enabled: boolean }) {
  const [counts, setCounts] = React.useState<{ mapLoads?: number; geocodeCalls?: number; firstEventAt?: number; lastEventAt?: number }>({})
  const [msg, setMsg] = React.useState<string>('')

  React.useEffect(() => {
    if (!enabled) return
    try { setCounts(getUsageSnapshot() || {}) } catch {}
  }, [enabled])

  const reset = () => {
    try { resetUsage(); setCounts(getUsageSnapshot() || {}) } catch {}
  }

  const sendSnapshot = async () => {
    setMsg('')
    try {
      const res = await fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: 'admin/tools', counts })
      })
      if (res.ok) setMsg('Snapshot sent')
      else setMsg('Telemetry not available')
    } catch {
      setMsg('Telemetry not available')
    }
  }

  if (!enabled) {
    return <div className="text-sm text-neutral-600">Usage logging disabled.</div>
  }

  const lines = Object.entries(counts)
    .map(([k, v]) => `${k}:${v ?? 0}`)
    .join('\n')

  return (
    <div className="space-y-2 text-sm">
      <div className="rounded border bg-neutral-50 p-2">
        <div className="mb-1 font-medium">Session counters</div>
        <div className="grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-3">
          <div>mapLoads: {counts.mapLoads ?? 0}</div>
          <div>geocodeCalls: {counts.geocodeCalls ?? 0}</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="rounded border px-2 py-1 text-xs">Reset</button>
          <button type="button" onClick={sendSnapshot} className="rounded border px-2 py-1 text-xs">Send server snapshot</button>
          <CopyButton text={lines} className="rounded border px-2 py-1 text-xs">Copy counts</CopyButton>
        </div>
        {msg && <div className="mt-1 text-xs text-neutral-700">{msg}</div>}
      </div>
    </div>
  )
}


