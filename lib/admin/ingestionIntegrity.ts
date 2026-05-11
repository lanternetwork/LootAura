/**
 * Admin ingestion integrity checks (read-only). RPC SQL lives in migration
 * `168_ingestion_integrity_report_rpc.sql` — keep CRITICAL_INDEX_NAMES in sync
 * with the ARRAY inside that migration.
 */

export const CRITICAL_INDEX_NAMES = [
  'idx_sales_ingested_sale_id_unique',
  'sales_geom_gist_idx',
  'idx_ingested_sales_publish_worker_claim',
  'idx_ingested_sales_geocode_claim',
] as const

export type IngestionIntegrityCheckLevel = 'hard' | 'warning'

export interface IngestionIntegrityCheck {
  id: string
  level: IngestionIntegrityCheckLevel
  ok: boolean
  detail?: Record<string, unknown>
}

export interface IngestionIntegrityResponse {
  ok: boolean
  hardFailures: string[]
  warnings: string[]
  checks: IngestionIntegrityCheck[]
  /** Raw RPC payload for debugging (same shape as DB JSON). */
  raw?: Record<string, unknown>
}

export interface IngestionIntegrityRpcPayload {
  generated_at?: string
  duplicate_ingested_sale_id_group_count?: number
  duplicate_ingested_sale_id_samples?: Array<{ ingested_sale_id: string; sale_count: number }>
  orphan_published_sale_id_count?: number
  orphan_sales_ingested_id_count?: number
  index_presence?: Array<{ name: string; present: boolean }>
  duplicate_external_source_url_group_count?: number
  duplicate_external_source_url_samples?: Array<{ external_source_url: string; sale_count: number }>
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return 0
}

function parseRpcPayload(data: unknown): IngestionIntegrityRpcPayload {
  const o = asRecord(data) ?? {}
  const indexRows = Array.isArray(o.index_presence) ? o.index_presence : []
  return {
    generated_at: typeof o.generated_at === 'string' ? o.generated_at : undefined,
    duplicate_ingested_sale_id_group_count: asNumber(o.duplicate_ingested_sale_id_group_count),
    duplicate_ingested_sale_id_samples: Array.isArray(o.duplicate_ingested_sale_id_samples)
      ? (o.duplicate_ingested_sale_id_samples as IngestionIntegrityRpcPayload['duplicate_ingested_sale_id_samples'])
      : [],
    orphan_published_sale_id_count: asNumber(o.orphan_published_sale_id_count),
    orphan_sales_ingested_id_count: asNumber(o.orphan_sales_ingested_id_count),
    index_presence: indexRows
      .map((row) => {
        const r = asRecord(row)
        if (!r) return null
        return {
          name: typeof r.name === 'string' ? r.name : '',
          present: r.present === true,
        }
      })
      .filter((x): x is { name: string; present: boolean } => x != null && x.name.length > 0),
    duplicate_external_source_url_group_count: asNumber(o.duplicate_external_source_url_group_count),
    duplicate_external_source_url_samples: Array.isArray(o.duplicate_external_source_url_samples)
      ? (o.duplicate_external_source_url_samples as IngestionIntegrityRpcPayload['duplicate_external_source_url_samples'])
      : [],
  }
}

/**
 * Maps DB snapshot JSON to API response. `includeRaw` adds `raw` for operators (optional).
 */
export function buildIngestionIntegrityResponse(
  data: unknown,
  options?: { includeRaw?: boolean }
): IngestionIntegrityResponse {
  const p = parseRpcPayload(data)
  const checks: IngestionIntegrityCheck[] = []

  const dupIngested = p.duplicate_ingested_sale_id_group_count
  checks.push({
    id: 'duplicate_sales_ingested_sale_id',
    level: 'hard',
    ok: dupIngested === 0,
    detail: {
      group_count: dupIngested,
      samples: p.duplicate_ingested_sale_id_samples ?? [],
    },
  })

  const orphanPub = p.orphan_published_sale_id_count
  checks.push({
    id: 'ingested_sales_published_sale_id_orphans',
    level: 'hard',
    ok: orphanPub === 0,
    detail: { orphan_count: orphanPub },
  })

  const orphanIngest = p.orphan_sales_ingested_id_count
  checks.push({
    id: 'sales_ingested_sale_id_orphans',
    level: 'hard',
    ok: orphanIngest === 0,
    detail: { orphan_count: orphanIngest },
  })

  const indexRows = p.index_presence ?? []
  const indexMap = new Map(indexRows.map((r) => [r.name, r.present]))
  for (const name of CRITICAL_INDEX_NAMES) {
    const present = indexMap.get(name) === true
    checks.push({
      id: `index_present:${name}`,
      level: 'hard',
      ok: present,
      detail: { index_name: name, present },
    })
  }

  const dupUrl = p.duplicate_external_source_url_group_count
  const urlWarn = dupUrl > 0
  checks.push({
    id: 'duplicate_external_source_url_published_imported',
    level: 'warning',
    ok: !urlWarn,
    detail: {
      group_count: dupUrl,
      samples: p.duplicate_external_source_url_samples ?? [],
      note:
        'Imported = import_source IS NOT NULL OR ingested_sale_id IS NOT NULL. Non-zero groups warrant investigation; does not fail overall ok.',
    },
  })

  const hardFailures: string[] = []
  for (const c of checks) {
    if (c.level === 'hard' && !c.ok) {
      if (c.id === 'duplicate_sales_ingested_sale_id') {
        hardFailures.push(`Duplicate non-null sales.ingested_sale_id groups: ${dupIngested} (expected 0)`)
      } else if (c.id === 'ingested_sales_published_sale_id_orphans') {
        hardFailures.push(
          `ingested_sales.published_sale_id points to missing sales.id: ${orphanPub} row(s) (expected 0)`
        )
      } else if (c.id === 'sales_ingested_sale_id_orphans') {
        hardFailures.push(
          `sales.ingested_sale_id points to missing ingested_sales.id: ${orphanIngest} row(s) (expected 0)`
        )
      } else if (c.id.startsWith('index_present:')) {
        const name = String(c.detail?.index_name ?? c.id.replace('index_present:', ''))
        hardFailures.push(`Missing required index on lootaura_v2: ${name} (schema drift)`)
      }
    }
  }

  const warnings: string[] = []
  if (urlWarn) {
    warnings.push(
      `Duplicate external_source_url among published imported sales: ${dupUrl} group(s) — investigate (samples in checks[].detail)`
    )
  }

  const ok = hardFailures.length === 0

  const out: IngestionIntegrityResponse = {
    ok,
    hardFailures,
    warnings,
    checks,
  }
  if (options?.includeRaw && asRecord(data)) {
    out.raw = asRecord(data) ?? undefined
  }
  return out
}
