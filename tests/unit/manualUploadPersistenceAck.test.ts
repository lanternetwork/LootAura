import { describe, it, expect } from 'vitest'
import { evaluateManualUploadPersistenceAck } from '@/lib/extension/manualUploadPersistenceAck'

describe('evaluateManualUploadPersistenceAck', () => {
  it('accepts 200 with ok, summary created>0, failed=0', () => {
    const r = evaluateManualUploadPersistenceAck(200, {
      ok: true,
      summary: { created: 1, updated: 0, failed: 0 },
    })
    expect(r.ok).toBe(true)
  })

  it('accepts updated-only persistence', () => {
    const r = evaluateManualUploadPersistenceAck(200, {
      ok: true,
      summary: { created: 0, updated: 1, failed: 0 },
    })
    expect(r.ok).toBe(true)
  })

  it('rejects non-200', () => {
    expect(evaluateManualUploadPersistenceAck(400, { ok: true }).ok).toBe(false)
  })

  it('rejects body.ok !== true', () => {
    expect(
      evaluateManualUploadPersistenceAck(200, {
        ok: false,
        summary: { created: 1, updated: 0, failed: 0 },
      }).ok
    ).toBe(false)
  })

  it('rejects missing summary', () => {
    expect(evaluateManualUploadPersistenceAck(200, { ok: true }).ok).toBe(false)
  })

  it('rejects failed>0', () => {
    expect(
      evaluateManualUploadPersistenceAck(200, {
        ok: true,
        summary: { created: 1, updated: 0, failed: 1 },
      }).ok
    ).toBe(false)
  })

  it('rejects zero created and updated', () => {
    expect(
      evaluateManualUploadPersistenceAck(200, {
        ok: true,
        summary: { created: 0, updated: 0, failed: 0 },
      }).ok
    ).toBe(false)
  })
})
