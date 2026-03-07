/**
 * Regression: in-app body background (in-app-shell) is gated by isInAppUserAgent;
 * normal web must not get the splash-colored background.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getInAppUaToken } from '@/lib/runtime/isNativeApp'

const IN_APP_UA = `Mozilla/5.0 (Linux; Android 10) ${getInAppUaToken()} Chrome/91.0`
const NORMAL_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))

describe('Layout in-app shell (body background gating)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('body has in-app-shell class when user-agent is in-app', async () => {
    const { headers } = await import('next/headers')
    vi.mocked(headers).mockResolvedValue({
      get: (key: string) => (key === 'user-agent' ? IN_APP_UA : null),
    } as Headers)

    const RootLayout = (await import('@/app/layout')).default
    const result = await RootLayout({ children: <div /> })

    const children = Array.isArray(result.props.children) ? result.props.children : [result.props.children]
    const body =
      children.find((c: { type?: string }) => c?.type === 'body') ??
      (children.length >= 2 && typeof children[1]?.props?.className === 'string' ? children[1] : undefined)
    expect(body).toBeDefined()
    expect(body.props.className).toContain('in-app-shell')
  })

  it('body does not have in-app-shell class when user-agent is normal web', async () => {
    const { headers } = await import('next/headers')
    vi.mocked(headers).mockResolvedValue({
      get: (key: string) => (key === 'user-agent' ? NORMAL_UA : null),
    } as Headers)

    const RootLayout = (await import('@/app/layout')).default
    const result = await RootLayout({ children: <div /> })

    const children = Array.isArray(result.props.children) ? result.props.children : [result.props.children]
    const body =
      children.find((c: { type?: string }) => c?.type === 'body') ??
      (children.length >= 2 && typeof children[1]?.props?.className === 'string' ? children[1] : undefined)
    expect(body).toBeDefined()
    expect(body.props.className).not.toContain('in-app-shell')
  })
})
