import { describe, expect, it } from 'vitest'
import { resolveZipLocalityPrimaryWithDiagnostics } from '@/lib/ingestion/zipLocalityPrimaryAuthority'

describe('resolveZipLocalityPrimaryWithDiagnostics', () => {
  it('returns Griffith for fixture ZIP 46319 scoped to IN', () => {
    const r = resolveZipLocalityPrimaryWithDiagnostics({ zip: '46319', expectedState: 'IN' })
    expect(r.rejectionReason).toBeNull()
    expect(r.result?.city).toBe('Griffith')
    expect(r.result?.state).toBe('IN')
  })

  it('rejects ambiguous Chicago fixture ZIP 60601 (no single primary)', () => {
    const r = resolveZipLocalityPrimaryWithDiagnostics({ zip: '60601', expectedState: 'IL' })
    expect(r.result).toBeNull()
    expect(r.rejectionReason).toBe('ambiguous_zip_locality')
  })

  it('rejects unknown ZIP', () => {
    const r = resolveZipLocalityPrimaryWithDiagnostics({ zip: '00001', expectedState: 'NY' })
    expect(r.rejectionReason).toBe('unknown_zip')
  })
})
