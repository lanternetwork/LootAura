export function formatDiagnosticCount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Number.isInteger(n)) return n.toLocaleString('en-US')
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function formatDiagnosticPct(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

export function diagnosticBullet(label: string, value: string | number): string {
  return `- ${label}: ${typeof value === 'number' ? formatDiagnosticCount(value) : value}`
}

export function topRecordEntries(
  map: Record<string, number>,
  limit: number
): Array<{ key: string; count: number }> {
  return Object.entries(map)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }))
}
