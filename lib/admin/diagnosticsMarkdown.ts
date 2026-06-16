export function formatDiagnosticsCount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Number.isInteger(n)) return n.toLocaleString('en-US')
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function formatDiagnosticsPct(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

export function formatDiagnosticsHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}h`
}

export function diagnosticsBullet(label: string, value: string | number): string {
  return `- ${label}: ${typeof value === 'number' ? formatDiagnosticsCount(value) : value}`
}
