import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { dnsLookup } = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
}))

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookup,
}))

const ctx = { city: 'Chicago', state: 'IL', pageIndex: 0, adapter: 'external_page_source' }

function publicDns(): void {
  dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
}

function htmlResponse(
  body: string,
  init?: { status?: number; headers?: Record<string, string> }
): Response {
  const { status = 200, headers = { 'Content-Type': 'text/html; charset=utf-8' } } = init ?? {}
  return new Response(body, { status, headers })
}

describe('externalPageSafeFetch', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
    publicDns()
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.clearAllMocks()
  })

  it('valid HTTPS fetch succeeds', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(htmlResponse('<html><body>ok</body></html>'))
    const { fetchSafeExternalPageHtml } = await import('@/lib/ingestion/adapters/externalPageSafeFetch')
    const html = await fetchSafeExternalPageHtml('https://example.com/list', ctx)
    expect(html).toContain('<html>')
    expect(dnsLookup).toHaveBeenCalled()
  })

  it('HTTP URL rejected', async () => {
    const { fetchSafeExternalPageHtml, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    await expect(fetchSafeExternalPageHtml('http://example.com/list', ctx)).rejects.toThrow(
      EXTERNAL_FETCH_REASON.INSECURE_SCHEME
    )
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('localhost rejected', async () => {
    const { fetchSafeExternalPageHtml, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    await expect(fetchSafeExternalPageHtml('https://localhost/path', ctx)).rejects.toThrow(
      EXTERNAL_FETCH_REASON.FORBIDDEN_HOSTNAME
    )
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('.local rejected', async () => {
    const { fetchSafeExternalPageHtml, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    await expect(fetchSafeExternalPageHtml('https://printer.local/', ctx)).rejects.toThrow(
      EXTERNAL_FETCH_REASON.FORBIDDEN_HOSTNAME
    )
  })

  it('private IPv4 rejected', async () => {
    const { fetchSafeExternalPageHtml, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    await expect(fetchSafeExternalPageHtml('https://10.0.0.1/', ctx)).rejects.toThrow(
      EXTERNAL_FETCH_REASON.NON_PUBLIC_IP
    )
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('private IPv6 rejected', async () => {
    const { fetchSafeExternalPageHtml, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    await expect(fetchSafeExternalPageHtml('https://[fc00::1]/', ctx)).rejects.toThrow(
      EXTERNAL_FETCH_REASON.NON_PUBLIC_IP
    )
  })

  it('IPv4-mapped IPv6 private address rejected', async () => {
    const { fetchSafeExternalPageHtml, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    await expect(fetchSafeExternalPageHtml('https://[::ffff:127.0.0.1]/', ctx)).rejects.toThrow(
      EXTERNAL_FETCH_REASON.NON_PUBLIC_IP
    )
  })

  it('CGNAT 100.64.0.0/10 rejected', async () => {
    const { fetchSafeExternalPageHtml, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    await expect(fetchSafeExternalPageHtml('https://100.64.0.1/', ctx)).rejects.toThrow(
      EXTERNAL_FETCH_REASON.NON_PUBLIC_IP
    )
  })

  it('metadata IP rejected', async () => {
    const { fetchSafeExternalPageHtml, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    await expect(fetchSafeExternalPageHtml('https://169.254.169.254/', ctx)).rejects.toThrow(
      EXTERNAL_FETCH_REASON.NON_PUBLIC_IP
    )
  })

  it('redirect to private IP rejected', async () => {
    const { fetchSafeExternalPageHtml, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: 'https://127.0.0.1/next' },
      })
    )
    await expect(fetchSafeExternalPageHtml('https://example.com/start', ctx)).rejects.toThrow(
      EXTERNAL_FETCH_REASON.NON_PUBLIC_IP
    )
  })

  it('redirect chain over limit rejected', async () => {
    const { fetchSafeExternalPageHtml, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    let n = 0
    vi.mocked(globalThis.fetch).mockImplementation(() => {
      n += 1
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { Location: `https://example.com/r${n}` },
        })
      )
    })
    await expect(fetchSafeExternalPageHtml('https://example.com/start', ctx)).rejects.toThrow(
      EXTERNAL_FETCH_REASON.REDIRECT_LIMIT
    )
    expect(n).toBeGreaterThanOrEqual(4)
  })

  it('timeout handled (fetch abort)', async () => {
    const { fetchSafeExternalPageHtml, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    vi.mocked(globalThis.fetch).mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined
        if (!signal) {
          reject(new Error('no signal'))
          return
        }
        const onAbort = (): void => {
          signal.removeEventListener('abort', onAbort)
          const err = new Error('Aborted')
          err.name = 'AbortError'
          reject(err)
        }
        signal.addEventListener('abort', onAbort)
      })
    })
    await expect(fetchSafeExternalPageHtml('https://example.com/slow', ctx)).rejects.toThrow(
      EXTERNAL_FETCH_REASON.TIMEOUT
    )
  })

  it('oversized body rejected', async () => {
    const { fetchSafeExternalPageHtml, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    const chunk = new Uint8Array(64 * 1024)
    chunk.fill(97)
    let calls = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        calls += 1
        if (calls > 20) {
          controller.close()
          return
        }
        controller.enqueue(chunk)
      },
    })
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    )
    await expect(fetchSafeExternalPageHtml('https://example.com/big', ctx)).rejects.toThrow(
      EXTERNAL_FETCH_REASON.OVERSIZED_BODY
    )
  })

  it('non-HTML content rejected', async () => {
    const { fetchSafeExternalPageHtml, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    await expect(fetchSafeExternalPageHtml('https://example.com/api', ctx)).rejects.toThrow(
      EXTERNAL_FETCH_REASON.NON_HTML
    )
  })

  it('missing content-type with plausible HTML allowed', async () => {
    const { fetchSafeExternalPageHtml } = await import('@/lib/ingestion/adapters/externalPageSafeFetch')
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('<html><body>x</body></html>', { status: 200 })
    )
    const html = await fetchSafeExternalPageHtml('https://example.com/nct', ctx)
    expect(html).toContain('<html>')
  })

  it('DNS resolution to private IP rejected', async () => {
    dnsLookup.mockResolvedValue([{ address: '192.168.1.1', family: 4 }])
    const { fetchSafeExternalPageHtml, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    await expect(fetchSafeExternalPageHtml('https://example.com/', ctx)).rejects.toThrow(
      EXTERNAL_FETCH_REASON.NON_PUBLIC_IP
    )
  })
})

describe('validateExternalHttpsUrlForFetch', () => {
  it('rejects userinfo URLs', async () => {
    const { validateExternalHttpsUrlForFetch, EXTERNAL_FETCH_REASON } = await import(
      '@/lib/ingestion/adapters/externalPageSafeFetch'
    )
    expect(() => validateExternalHttpsUrlForFetch('https://user:pass@example.com/')).toThrow(
      EXTERNAL_FETCH_REASON.USERINFO_FORBIDDEN
    )
  })
})
