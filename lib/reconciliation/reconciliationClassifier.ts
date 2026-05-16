import type { IngestFingerprint, ReconciliationChangeClass } from '@/lib/reconciliation/types'

const CLASS_ORDER: readonly ReconciliationChangeClass[] = [
  'parse_failed',
  'source_missing_soft',
  'placeholder_resolved',
  'schedule_changed',
  'images_changed',
  'description_changed',
  'placeholder_detected',
  'no_material_change',
]

function sortUniqueClasses(classes: readonly ReconciliationChangeClass[]): ReconciliationChangeClass[] {
  const uniq = Array.from(new Set(classes))
  uniq.sort((a, b) => CLASS_ORDER.indexOf(a) - CLASS_ORDER.indexOf(b))
  return uniq
}

export interface ClassificationInput {
  readonly priorFingerprint: IngestFingerprint
  readonly nextFingerprint: IngestFingerprint
  readonly priorPlaceholder: boolean
  readonly nextPlaceholder: boolean
  readonly parseFailed?: boolean
  readonly sourceMissingSoft?: boolean
}

export interface ClassificationResult {
  readonly classes: readonly ReconciliationChangeClass[]
  readonly primary: ReconciliationChangeClass
}

/**
 * Deterministic change classification from fingerprints and placeholder flags.
 */
export function classifyReconciliationChange(input: ClassificationInput): ClassificationResult {
  const classes: ReconciliationChangeClass[] = []

  if (input.parseFailed) {
    classes.push('parse_failed')
  }
  if (input.sourceMissingSoft) {
    classes.push('source_missing_soft')
  }

  if (!input.parseFailed && !input.sourceMissingSoft) {
    const contentChanged = input.priorFingerprint.contentHash !== input.nextFingerprint.contentHash
    const scheduleChanged = input.priorFingerprint.scheduleHash !== input.nextFingerprint.scheduleHash
    const imagesChanged = input.priorFingerprint.imageHash !== input.nextFingerprint.imageHash

    if (contentChanged) classes.push('description_changed')
    if (scheduleChanged) classes.push('schedule_changed')
    if (imagesChanged) classes.push('images_changed')
    if (input.priorPlaceholder && !input.nextPlaceholder) {
      classes.push('placeholder_resolved')
    }
    if (input.nextPlaceholder) {
      classes.push('placeholder_detected')
    }

    const material = contentChanged || scheduleChanged || imagesChanged
    if (!material && !input.nextPlaceholder) {
      classes.push('no_material_change')
    }
  }

  const sorted = sortUniqueClasses(classes)
  const primary = sorted[0] ?? 'no_material_change'
  return { classes: sorted, primary }
}
