import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Policy } from '@/lib/rateLimit/policies'
import { Policies } from '@/lib/rateLimit/policies'

const { policyCaptures } = vi.hoisted(() => ({
  policyCaptures: [] as Policy[][],
}))

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: unknown, policies: Policy[]) => {
    policyCaptures.push(policies)
    return handler
  },
}))

const expectedManual: Policy[] = [
  Policies.MANUAL_INGESTION_BURST,
  Policies.MANUAL_INGESTION_HOURLY,
]

describe('manual ingestion admin routes - rate policy wiring', () => {
  beforeEach(() => {
    vi.resetModules()
    policyCaptures.length = 0
  })

  it('list + upload use MANUAL_INGESTION_*; images-stats keeps ADMIN_TOOLS / ADMIN_HOURLY', async () => {
    await import('@/app/api/admin/ingested-sales/list/route')
    await import('@/app/api/admin/ingested-sales/upload/route')
    await import('@/app/api/admin/images-stats/route')

    expect(policyCaptures[0]).toEqual(expectedManual)
    expect(policyCaptures[1]).toEqual(expectedManual)
    expect(policyCaptures[2]).toEqual([Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY])
  })
})
