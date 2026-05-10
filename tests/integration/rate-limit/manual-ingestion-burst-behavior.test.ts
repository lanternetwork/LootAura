/**
 * Behavioral checks for MANUAL_INGESTION_* policies (same limits as list/upload routes).
 * Uses in-memory rate limit store (no Redis in typical test env).
 */
import { describe, it, expect, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

vi.mock('@/lib/rateLimit/config', () => ({
  shouldBypassRateLimit: () => false,
}))

const manualIngestionPolicies = [
  Policies.MANUAL_INGESTION_BURST,
  Policies.MANUAL_INGESTION_HOURLY,
] as const

describe('MANUAL_INGESTION burst / hourly (parity with ingested-sales list + upload)', () => {
  it('allows at least 4 POSTs to upload path within 30s (regression vs old ADMIN_TOOLS 3/30s)', async () => {
    const wrapped = withRateLimit(
      async () => NextResponse.json({ ok: true }),
      [...manualIngestionPolicies]
    )
    const ip = '203.0.113.10'
    for (let _n = 0; _n < 4; _n += 1) {
      const req = new NextRequest('http://localhost/api/admin/ingested-sales/upload', {
        method: 'POST',
        headers: { 'x-forwarded-for': ip },
      })
      const res = await wrapped(req)
      expect(res.status).toBe(200)
    }
  })

  it('returns 429 with MANUAL_INGESTION_BURST in denyingPolicies on 31st POST (30/30s cap)', async () => {
    const wrapped = withRateLimit(
      async () => NextResponse.json({ ok: true }),
      [...manualIngestionPolicies]
    )
    const ip = '203.0.113.11'
    for (let _n = 0; _n < 30; _n += 1) {
      const req = new NextRequest('http://localhost/api/admin/ingested-sales/upload', {
        method: 'POST',
        headers: { 'x-forwarded-for': ip },
      })
      expect((await wrapped(req)).status).toBe(200)
    }
    const req31 = new NextRequest('http://localhost/api/admin/ingested-sales/upload', {
      method: 'POST',
      headers: { 'x-forwarded-for': ip },
    })
    const blocked = await wrapped(req31)
    expect(blocked.status).toBe(429)
    const body = await blocked.json()
    expect(body.error).toBe('rate_limited')
    expect(body.denyingPolicies).toContain('MANUAL_INGESTION_BURST')
    expect(typeof body.retryAfterSec).toBe('number')
    expect(body.retryAfterSec).toBeGreaterThanOrEqual(1)
  })

  it('applies same burst envelope to GET list path (preflight)', async () => {
    const wrapped = withRateLimit(
      async () => NextResponse.json({ ok: true }),
      [...manualIngestionPolicies]
    )
    const ip = '203.0.113.12'
    for (let _n = 0; _n < 30; _n += 1) {
      const req = new NextRequest('http://localhost/api/admin/ingested-sales/list?limit=1', {
        method: 'GET',
        headers: { 'x-forwarded-for': ip },
      })
      expect((await wrapped(req)).status).toBe(200)
    }
    const req31 = new NextRequest('http://localhost/api/admin/ingested-sales/list?limit=1', {
      method: 'GET',
      headers: { 'x-forwarded-for': ip },
    })
    const blocked = await wrapped(req31)
    expect(blocked.status).toBe(429)
    const body = await blocked.json()
    expect(body.denyingPolicies).toContain('MANUAL_INGESTION_BURST')
  })
})
