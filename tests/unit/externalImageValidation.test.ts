import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dnsLookup } = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
}))

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookup,
}))

describe('external image URL validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
  })

  it('accepts valid HTTPS public image URL', async () => {
    const { isValidExternalImageUrl } = await import('@/lib/ingestion/externalImageValidation')
    await expect(isValidExternalImageUrl('https://images.example.org/a.jpg')).resolves.toBe(true)
  })

  it('rejects localhost and private targets', async () => {
    const { isValidExternalImageUrl } = await import('@/lib/ingestion/externalImageValidation')
    await expect(isValidExternalImageUrl('https://localhost/a.jpg')).resolves.toBe(false)
    await expect(isValidExternalImageUrl('https://127.0.0.1/a.jpg')).resolves.toBe(false)
    await expect(isValidExternalImageUrl('https://10.0.0.8/a.jpg')).resolves.toBe(false)
  })

  it('rejects non-HTTPS URLs', async () => {
    const { isValidExternalImageUrl } = await import('@/lib/ingestion/externalImageValidation')
    await expect(isValidExternalImageUrl('http://images.example.org/a.jpg')).resolves.toBe(false)
  })

  it('rejects hostnames resolving to private IPs', async () => {
    dnsLookup.mockResolvedValue([{ address: '192.168.1.9', family: 4 }])
    const { isValidExternalImageUrl } = await import('@/lib/ingestion/externalImageValidation')
    await expect(isValidExternalImageUrl('https://images.example.org/a.jpg')).resolves.toBe(false)
  })
})
