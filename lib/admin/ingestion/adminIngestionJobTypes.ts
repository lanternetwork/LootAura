export const ADMIN_INGESTION_JOB_KEYS = [
  'missing_ingest',
  'fresh_discovery',
  'geocode',
  'coverage_audit',
  'catalog_repair',
  'shadow_replay',
  'daily_ingestion',
] as const

export type AdminIngestionJobKey = (typeof ADMIN_INGESTION_JOB_KEYS)[number]

export type AdminIngestionJobRunStatus = 'success' | 'skipped' | 'failed'

export type AdminIngestionJobRunResponse = {
  ok: boolean
  job: AdminIngestionJobKey
  status: AdminIngestionJobRunStatus
  duration_ms: number
  ran_at: string
  telemetry?: Record<string, unknown>
  skipReason?: string
  error?: string
  stack_top?: string | null
}

export type AdminIngestionJobDefinition = {
  key: AdminIngestionJobKey
  label: string
  description: string
}

export const ADMIN_INGESTION_JOB_DEFINITIONS: readonly AdminIngestionJobDefinition[] = [
  {
    key: 'missing_ingest',
    label: 'Missing ingest',
    description: 'Bounded ingestion for valid external URLs missing from LootAura.',
  },
  {
    key: 'fresh_discovery',
    label: 'Fresh discovery',
    description: '15-minute fresh YSTM list discovery and list-metadata promotion.',
  },
  {
    key: 'geocode',
    label: 'Geocode',
    description: 'One bounded geocode pipeline pass (queue + backlog + replay).',
  },
  {
    key: 'coverage_audit',
    label: 'Coverage audit',
    description: 'Bounded external marketplace product-coverage audit.',
  },
  {
    key: 'catalog_repair',
    label: 'Catalog repair',
    description: 'Bounded repair for known external-source ingested_sales backlog.',
  },
  {
    key: 'shadow_replay',
    label: 'Shadow replay',
    description: 'Replay missing valid YSTM URLs through legacy vs new classifier.',
  },
  {
    key: 'daily_ingestion',
    label: 'Daily ingestion',
    description: 'Ingestion orchestration only (external fetch + geocode + publish).',
  },
] as const

export function isAdminIngestionJobKey(value: unknown): value is AdminIngestionJobKey {
  return typeof value === 'string' && (ADMIN_INGESTION_JOB_KEYS as readonly string[]).includes(value)
}
