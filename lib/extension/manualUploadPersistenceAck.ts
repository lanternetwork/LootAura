/**
 * Shared rules for extension manual upload acknowledgement (mirrors lootaura-content.js).
 * Manual upload persistence acknowledgement rules (unit-tested).
 */

export function evaluateManualUploadPersistenceAck(
  status: number,
  body: unknown
): { ok: boolean; reason: string } {
  if (status !== 200) {
    return { ok: false, reason: 'bad_status' }
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'no_body' }
  }
  const b = body as Record<string, unknown>
  if (b.ok !== true) {
    return { ok: false, reason: 'body_not_ok' }
  }
  const summary = b.summary
  if (!summary || typeof summary !== 'object') {
    return { ok: false, reason: 'no_summary' }
  }
  const s = summary as Record<string, unknown>
  const created = Number(s.created)
  const updated = Number(s.updated)
  const failed = Number(s.failed)
  const c = Number.isFinite(created) ? created : 0
  const u = Number.isFinite(updated) ? updated : 0
  const f = Number.isFinite(failed) ? failed : 0
  if (f !== 0) {
    return { ok: false, reason: 'failed_records' }
  }
  if (c + u <= 0) {
    return { ok: false, reason: 'no_persistence' }
  }
  return { ok: true, reason: 'ok' }
}
