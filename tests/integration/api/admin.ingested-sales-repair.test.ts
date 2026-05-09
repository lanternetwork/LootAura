import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockAssertAdminOrThrow = vi.fn()
const loggerInfo = vi.fn()
const loggerError = vi.fn()
const mockFromBase = vi.fn()

vi.mock('@/lib/auth/adminGate', () => ({
  assertAdminOrThrow: (...args: unknown[]) => mockAssertAdminOrThrow(...args),
}))

vi.mock('@/lib/log', () => ({
  logger: {
    info: (...args: unknown[]) => loggerInfo(...args),
    error: (...args: unknown[]) => loggerError(...args),
  },
}))

vi.mock('@/lib/rateLimit/withRateLimit', () => ({
  withRateLimit: (handler: unknown) => handler,
}))

vi.mock('@/lib/rateLimit/policies', () => ({
  Policies: {
    ADMIN_TOOLS: 'ADMIN_TOOLS',
    ADMIN_HOURLY: 'ADMIN_HOURLY',
  },
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
  fromBase: (...args: unknown[]) => mockFromBase(...args),
}))

function makeRows() {
  return [
    {
      id: 'sale-1',
      ingested_sale_id: 'ing-1',
      description:
        'Great bikes and toys. Street View Directions Source: garagesalefinder.com',
      address: '620 lincoln ave, winnetka, il 60093, Winnetka, IL',
      city: 'Winnetka',
      state: 'IL',
      ingested: [{
        id: 'ing-1',
        description:
          'Great bikes and toys. Street View Directions Source: garagesalefinder.com',
        raw_text:
          'Great bikes and toys. Street View Directions Source: garagesalefinder.com',
        city: 'Winnetka',
        state: 'IL',
      }],
    },
    {
      id: 'sale-2',
      ingested_sale_id: 'ing-2',
      description: 'Clean curated description.',
      address: '5918 Park Ave, Berkeley, IL',
      city: 'Berkeley',
      state: 'IL',
      ingested: [{
        id: 'ing-2',
        description: 'Clean curated description.',
        raw_text: 'Clean curated description.',
        city: 'Berkeley',
        state: 'IL',
      }],
    },
  ]
}

function mockSalesListResult(rows: unknown[]) {
  const chain = {
    not: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data: rows, error: null })),
  }
  return {
    select: vi.fn(() => chain),
  }
}

describe('POST /api/admin/ingested-sales/repair', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertAdminOrThrow.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@example.com' },
    })
  })

  it('requires admin auth', async () => {
    mockAssertAdminOrThrow.mockRejectedValue(new Error('Forbidden'))
    const { POST } = await import('@/app/api/admin/ingested-sales/repair/route')
    const req = new NextRequest('http://localhost/api/admin/ingested-sales/repair', {
      method: 'POST',
      body: JSON.stringify({ dryRun: true }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(req)
    expect(response.status).toBe(403)
  })

  it('dry run reports repairs and does not write', async () => {
    const rows = makeRows()
    const salesList = mockSalesListResult(rows)
    const salesUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
    const ingestedUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'sales') {
        const callCount = mockFromBase.mock.calls.filter((c) => c[1] === 'sales').length
        if (callCount === 1) return salesList
        return { update: salesUpdate }
      }
      if (table === 'ingested_sales') {
        return { update: ingestedUpdate }
      }
      return {}
    })

    const { POST } = await import('@/app/api/admin/ingested-sales/repair/route')
    const req = new NextRequest('http://localhost/api/admin/ingested-sales/repair', {
      method: 'POST',
      body: JSON.stringify({ dryRun: true }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(req)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.dryRun).toBe(true)
    expect(json.repaired.ingestedDescription).toBe(1)
    expect(json.repaired.salesDescription).toBe(1)
    expect(json.repaired.salesAddress).toBe(1)
    expect(json.writes).toBe(0)
    expect(salesUpdate).not.toHaveBeenCalled()
    expect(ingestedUpdate).not.toHaveBeenCalled()
  })

  it('repairs polluted description and duplicated address in non-dry-run mode', async () => {
    const rows = makeRows()
    const salesList = mockSalesListResult(rows)
    const salesEq = vi.fn(async () => ({ error: null }))
    const ingestedEq = vi.fn(async () => ({ error: null }))
    const salesUpdate = vi.fn(() => ({ eq: salesEq }))
    const ingestedUpdate = vi.fn(() => ({ eq: ingestedEq }))

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'sales') {
        const callCount = mockFromBase.mock.calls.filter((c) => c[1] === 'sales').length
        if (callCount === 1) return salesList
        return { update: salesUpdate }
      }
      if (table === 'ingested_sales') {
        return { update: ingestedUpdate }
      }
      return {}
    })

    const { POST } = await import('@/app/api/admin/ingested-sales/repair/route')
    const req = new NextRequest('http://localhost/api/admin/ingested-sales/repair', {
      method: 'POST',
      body: JSON.stringify({ dryRun: false }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(req)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.dryRun).toBe(false)
    expect(ingestedUpdate).toHaveBeenCalledWith({
      description: 'Great bikes and toys.',
      raw_text: 'Great bikes and toys.',
    })
    expect(salesUpdate).toHaveBeenCalledWith({
      description: 'Great bikes and toys.',
    })
    expect(salesUpdate).toHaveBeenCalledWith({
      address: '620 Lincoln Ave, Winnetka, IL 60093',
    })
    expect(json.writes).toBe(3)
  })

  it('leaves good rows untouched', async () => {
    const rows = [makeRows()[1]]
    const salesList = mockSalesListResult(rows)
    const salesUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
    const ingestedUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))

    mockFromBase.mockImplementation((_db: unknown, table: string) => {
      if (table === 'sales') {
        const callCount = mockFromBase.mock.calls.filter((c) => c[1] === 'sales').length
        if (callCount === 1) return salesList
        return { update: salesUpdate }
      }
      if (table === 'ingested_sales') {
        return { update: ingestedUpdate }
      }
      return {}
    })

    const { POST } = await import('@/app/api/admin/ingested-sales/repair/route')
    const req = new NextRequest('http://localhost/api/admin/ingested-sales/repair', {
      method: 'POST',
      body: JSON.stringify({ dryRun: false }),
      headers: { 'content-type': 'application/json' },
    })
    const response = await POST(req)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.repaired.ingestedDescription).toBe(0)
    expect(json.repaired.salesDescription).toBe(0)
    expect(json.repaired.salesAddress).toBe(0)
    expect(json.writes).toBe(0)
    expect(salesUpdate).not.toHaveBeenCalled()
    expect(ingestedUpdate).not.toHaveBeenCalled()
  })
})

