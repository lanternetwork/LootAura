import { describe, expect, it } from 'vitest'
import { shouldRunEsnetDiscoveryThisInvocation } from '@/lib/ingestion/estatesalesnet/esnetDiscoveryCadence'

describe('shouldRunEsnetDiscoveryThisInvocation', () => {
  it('runs on shared discovery cron UTC hours only', () => {
    expect(shouldRunEsnetDiscoveryThisInvocation(new Date('2026-05-24T02:15:00.000Z'))).toBe(true)
    expect(shouldRunEsnetDiscoveryThisInvocation(new Date('2026-05-24T05:00:00.000Z'))).toBe(false)
  })
})
