import { describe, expect, it } from 'vitest'
import { classifyReconciliationChange } from '@/lib/reconciliation/reconciliationClassifier'
import { fingerprintFromParts } from '@/lib/reconciliation/sourceHashing'

describe('reconciliationClassifier', () => {
  it('classifies parse_failed only', () => {
    const fp = fingerprintFromParts({
      title: 't',
      description: 'd',
      dateStart: null,
      dateEnd: null,
      timeStart: null,
      timeEnd: null,
      listingTimezone: null,
      imageUrls: [],
    })
    const r = classifyReconciliationChange({
      priorFingerprint: fp,
      nextFingerprint: fp,
      priorPlaceholder: false,
      nextPlaceholder: false,
      parseFailed: true,
    })
    expect(r.primary).toBe('parse_failed')
    expect(r.classes).toEqual(['parse_failed'])
  })

  it('classifies source_missing_soft', () => {
    const fp = fingerprintFromParts({
      title: 't',
      description: 'd',
      dateStart: null,
      dateEnd: null,
      timeStart: null,
      timeEnd: null,
      listingTimezone: null,
      imageUrls: [],
    })
    const r = classifyReconciliationChange({
      priorFingerprint: fp,
      nextFingerprint: fp,
      priorPlaceholder: false,
      nextPlaceholder: false,
      sourceMissingSoft: true,
    })
    expect(r.primary).toBe('source_missing_soft')
    expect(r.classes).toEqual(['source_missing_soft'])
  })

  it('dedupes class list deterministically', () => {
    const prior = fingerprintFromParts({
      title: 'A',
      description: 'old',
      dateStart: '2026-05-15',
      dateEnd: '2026-05-16',
      timeStart: null,
      timeEnd: null,
      listingTimezone: null,
      imageUrls: ['https://x.com/1.jpg'],
    })
    const next = fingerprintFromParts({
      title: 'A',
      description: 'new',
      dateStart: '2026-05-15',
      dateEnd: '2026-05-16',
      timeStart: null,
      timeEnd: null,
      listingTimezone: null,
      imageUrls: ['https://x.com/2.jpg'],
    })
    const r = classifyReconciliationChange({
      priorFingerprint: prior,
      nextFingerprint: next,
      priorPlaceholder: true,
      nextPlaceholder: false,
    })
    expect(new Set(r.classes).size).toBe(r.classes.length)
    expect(r.classes).toContain('description_changed')
    expect(r.classes).toContain('images_changed')
    expect(r.classes).toContain('placeholder_resolved')
  })
})
