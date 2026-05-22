import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from '@/lib/admin/copyTextToClipboard'

describe('copyTextToClipboard', () => {
  const writeText = vi.fn()

  beforeEach(() => {
    writeText.mockReset()
    writeText.mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        value: '',
        style: {},
        setAttribute: vi.fn(),
        select: vi.fn(),
      })),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      execCommand: vi.fn(() => true),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses navigator.clipboard.writeText when available', async () => {
    await copyTextToClipboard('hello diagnostics')
    expect(writeText).toHaveBeenCalledWith('hello diagnostics')
  })

  it('falls back to execCommand when clipboard API throws', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    await copyTextToClipboard('fallback text')
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('throws when both clipboard paths fail', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        value: '',
        style: {},
        setAttribute: vi.fn(),
        select: vi.fn(),
      })),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand: vi.fn(() => false),
    })
    await expect(copyTextToClipboard('nope')).rejects.toThrow(/Clipboard unavailable/)
  })
})
