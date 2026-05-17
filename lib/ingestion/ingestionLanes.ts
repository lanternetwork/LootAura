/**
 * Phase C: deterministic ingestion fetch lanes (region + global).
 * No PII — filters use config `state` only.
 */

import type { ExternalCityConfigRow } from '@/lib/ingestion/partitionCrawlableExternalConfigs'

export const LEGACY_ORCHESTRATION_STATE_KEY = 'external_page_source'
export const LANE_ROTATION_STATE_KEY = 'ingestion_lane_rotation'

export type IngestionLaneType = 'global' | 'region'

export type IngestionLaneKey =
  | 'global'
  | 'region:northeast'
  | 'region:southeast'
  | 'region:midwest'
  | 'region:southwest'
  | 'region:west'

export type IngestionLaneDefinition = {
  laneKey: IngestionLaneKey
  laneType: IngestionLaneType
  /** Census-style region id when laneType is region. */
  laneRegion: string | null
  stateKey: string
}

const REGION_LANE_KEYS: IngestionLaneKey[] = [
  'region:northeast',
  'region:southeast',
  'region:midwest',
  'region:southwest',
  'region:west',
]

export const ALL_INGESTION_LANE_KEYS: IngestionLaneKey[] = ['global', ...REGION_LANE_KEYS]

const STATE_TO_REGION: Record<string, IngestionLaneKey> = {
  CT: 'region:northeast',
  ME: 'region:northeast',
  MA: 'region:northeast',
  NH: 'region:northeast',
  RI: 'region:northeast',
  VT: 'region:northeast',
  NJ: 'region:northeast',
  NY: 'region:northeast',
  PA: 'region:northeast',
  AL: 'region:southeast',
  AR: 'region:southeast',
  FL: 'region:southeast',
  GA: 'region:southeast',
  KY: 'region:southeast',
  LA: 'region:southeast',
  MS: 'region:southeast',
  NC: 'region:southeast',
  SC: 'region:southeast',
  TN: 'region:southeast',
  VA: 'region:southeast',
  WV: 'region:southeast',
  DC: 'region:southeast',
  MD: 'region:southeast',
  DE: 'region:southeast',
  IL: 'region:midwest',
  IN: 'region:midwest',
  IA: 'region:midwest',
  KS: 'region:midwest',
  MI: 'region:midwest',
  MN: 'region:midwest',
  MO: 'region:midwest',
  NE: 'region:midwest',
  ND: 'region:midwest',
  OH: 'region:midwest',
  SD: 'region:midwest',
  WI: 'region:midwest',
  AZ: 'region:southwest',
  NM: 'region:southwest',
  OK: 'region:southwest',
  TX: 'region:southwest',
  AK: 'region:west',
  CA: 'region:west',
  CO: 'region:west',
  HI: 'region:west',
  ID: 'region:west',
  MT: 'region:west',
  NV: 'region:west',
  OR: 'region:west',
  UT: 'region:west',
  WA: 'region:west',
  WY: 'region:west',
}

export function isIngestionLaneModeEnabled(): boolean {
  const raw = process.env.INGESTION_LANE_MODE
  if (raw === undefined || raw === '') return false
  const v = raw.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

export function isIngestionLaneRotationEnabled(): boolean {
  const raw = process.env.INGESTION_LANE_ROTATION_ENABLED
  if (raw === undefined || raw === '') {
    return isIngestionLaneModeEnabled()
  }
  const v = raw.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

export function parseIngestionLaneRotationList(): IngestionLaneKey[] {
  const raw = process.env.INGESTION_LANE_ROTATION
  if (raw === undefined || raw === '') {
    return [...ALL_INGESTION_LANE_KEYS]
  }
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  const lanes: IngestionLaneKey[] = []
  for (const part of parts) {
    const parsed = parseIngestionLaneKey(part)
    if (parsed) {
      lanes.push(parsed)
    }
  }
  return lanes.length > 0 ? lanes : [...ALL_INGESTION_LANE_KEYS]
}

export function parseIngestionLaneKey(raw: string): IngestionLaneKey | null {
  const normalized = raw.trim().toLowerCase()
  if (ALL_INGESTION_LANE_KEYS.includes(normalized as IngestionLaneKey)) {
    return normalized as IngestionLaneKey
  }
  return null
}

export function laneDefinitionForKey(laneKey: IngestionLaneKey): IngestionLaneDefinition {
  if (laneKey === 'global') {
    return {
      laneKey,
      laneType: 'global',
      laneRegion: null,
      stateKey: `${LEGACY_ORCHESTRATION_STATE_KEY}:global`,
    }
  }
  const region = laneKey.replace(/^region:/, '')
  return {
    laneKey,
    laneType: 'region',
    laneRegion: region,
    stateKey: `${LEGACY_ORCHESTRATION_STATE_KEY}:${laneKey}`,
  }
}

/** Legacy single-lane context when INGESTION_LANE_MODE is off. */
export function legacyIngestionLaneContext(): IngestionLaneContext {
  return {
    laneModeEnabled: false,
    lane: {
      laneKey: 'global',
      laneType: 'global',
      laneRegion: null,
      stateKey: LEGACY_ORCHESTRATION_STATE_KEY,
    },
    rotationApplied: false,
  }
}

export type IngestionLaneContext = {
  laneModeEnabled: boolean
  lane: IngestionLaneDefinition
  rotationApplied: boolean
}

export function resolveIngestionLaneFromParam(
  laneParam: string | null | undefined
): { ok: true; lane: IngestionLaneDefinition } | { ok: false; error: string } {
  if (!laneParam || laneParam.trim() === '') {
    return { ok: false, error: 'lane_required' }
  }
  const key = parseIngestionLaneKey(laneParam)
  if (!key) {
    return { ok: false, error: 'invalid_lane' }
  }
  return { ok: true, lane: laneDefinitionForKey(key) }
}

export function normalizeConfigState(state: string | null | undefined): string {
  return (state ?? '').trim().toUpperCase()
}

export function regionLaneForState(state: string | null | undefined): IngestionLaneKey | null {
  const code = normalizeConfigState(state)
  if (!code) return null
  return STATE_TO_REGION[code] ?? null
}

export function configMatchesLane(row: ExternalCityConfigRow, lane: IngestionLaneDefinition): boolean {
  if (lane.laneType === 'global') {
    return true
  }
  const regionLane = regionLaneForState(row.state)
  return regionLane === lane.laneKey
}

export function filterConfigsForLane(
  rows: ExternalCityConfigRow[],
  lane: IngestionLaneDefinition
): ExternalCityConfigRow[] {
  return rows.filter((row) => configMatchesLane(row, lane))
}

export function allLaneStateKeysForSeed(): string[] {
  return [
    ...ALL_INGESTION_LANE_KEYS.map((k) => laneDefinitionForKey(k).stateKey),
    LANE_ROTATION_STATE_KEY,
  ]
}

export type IngestionLaneNoteFields = {
  laneKey: string
  laneType: IngestionLaneType
  laneRegion: string | null
  laneConfigsCrawlable?: number
  laneConfigsProcessed?: number
  laneConfigsRemaining?: number
  laneCursorBefore?: number
  laneCursorAfter?: number
  laneOverlapPrevented?: boolean
  laneStaleLockRecovered?: boolean
  laneAdaptiveProfile?: string
}

export function laneNoteFields(
  lane: IngestionLaneDefinition,
  extras: Partial<IngestionLaneNoteFields> = {}
): IngestionLaneNoteFields {
  return {
    laneKey: lane.laneKey,
    laneType: lane.laneType,
    laneRegion: lane.laneRegion,
    ...extras,
  }
}

export function readLaneKeyFromExternalNote(
  note: Record<string, unknown> | null | undefined
): string | null {
  if (!note || typeof note !== 'object') return null
  const laneKey = note.laneKey
  return typeof laneKey === 'string' && laneKey.length > 0 ? laneKey : null
}

export function externalNoteMatchesLane(
  note: Record<string, unknown> | null | undefined,
  lane: IngestionLaneDefinition,
  laneModeEnabled: boolean
): boolean {
  if (!laneModeEnabled) {
    return readLaneKeyFromExternalNote(note) == null
  }
  const key = readLaneKeyFromExternalNote(note)
  return key === lane.laneKey
}
