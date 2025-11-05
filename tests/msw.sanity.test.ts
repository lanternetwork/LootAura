import { describe, it, expect } from 'vitest'

describe('MSW sanity', () => {
  it('intercepts upstream Nominatim search', async () => {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&q=Test&limit=1'
    const res = await fetch(url)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body[0]?.display_name).toMatch(/Test St/)
  })

  it('intercepts relative suggest route', async () => {
    const res = await fetch('http://localhost/api/geocoding/suggest?q=Test')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.data?.[0]?.label).toMatch(/Test St/)
  })
})


