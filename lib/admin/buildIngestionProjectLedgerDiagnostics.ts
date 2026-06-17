import { diagnosticBullet } from '@/lib/admin/diagnosticsMarkdown'

/** Curated project memory for episodic LLM review — update when tracks close. */
const LEDGER_AS_OF = '2026-06-17'

const LEDGER_VERIFIED = [
  'scheduler starvation',
  'tiered scheduler',
  'freshness program',
  'view sale regression',
  'metadata decoupling',
] as const

const LEDGER_IN_PROGRESS = ['discovery freshness burn-in', 'diagnostic_copy_v1'] as const

const LEDGER_BLOCKED_ENVIRONMENT: string[] = []

const LEDGER_NOT_STARTED: string[] = []

export function buildIngestionProjectLedgerDiagnostics(): string {
  const lines = [
    '## PROJECT LEDGER',
    diagnosticBullet('as of', LEDGER_AS_OF),
    '',
    '### VERIFIED',
    ...LEDGER_VERIFIED.map((item) => diagnosticBullet('item', item)),
    '',
    '### IN_PROGRESS',
    ...LEDGER_IN_PROGRESS.map((item) => diagnosticBullet('item', item)),
    '',
    '### BLOCKED_ENVIRONMENT',
    ...(LEDGER_BLOCKED_ENVIRONMENT.length > 0
      ? LEDGER_BLOCKED_ENVIRONMENT.map((item) => diagnosticBullet('item', item))
      : [diagnosticBullet('item', '(none)')]),
    '',
    '### NOT_STARTED',
    ...(LEDGER_NOT_STARTED.length > 0
      ? LEDGER_NOT_STARTED.map((item) => diagnosticBullet('item', item))
      : [diagnosticBullet('item', '(none)')]),
  ]

  return lines.join('\n')
}
