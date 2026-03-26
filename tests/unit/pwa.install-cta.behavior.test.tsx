import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PWAPlatformProvider } from '@/components/pwa/PWAPlatformProvider'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'

interface MockBeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

describe('PWA install CTA behavior', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      configurable: true,
    })

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)' ? false : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it('shows Android install CTA when beforeinstallprompt fires', async () => {
    render(
      <PWAPlatformProvider>
        <PWAInstallPrompt />
      </PWAPlatformProvider>
    )

    expect(screen.queryByText('Install LootAura for quicker access')).toBeNull()

    const bipEvent = Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    }) as MockBeforeInstallPromptEvent

    window.dispatchEvent(bipEvent)

    await waitFor(() => {
      expect(screen.getByText('Install LootAura for quicker access')).toBeInTheDocument()
    })
  })

  it('suppresses Android install CTA in native app context', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 LootAuraInApp/1.0',
      configurable: true,
    })

    render(
      <PWAPlatformProvider>
        <PWAInstallPrompt />
      </PWAPlatformProvider>
    )

    const bipEvent = Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    }) as MockBeforeInstallPromptEvent
    window.dispatchEvent(bipEvent)

    await waitFor(() => {
      expect(screen.queryByText('Install LootAura for quicker access')).toBeNull()
    })
  })

  it('suppresses iOS helper in native app context', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 LootAuraInApp/1.0',
      configurable: true,
    })

    render(
      <PWAPlatformProvider>
        <PWAInstallPrompt />
      </PWAPlatformProvider>
    )

    await waitFor(() => {
      expect(screen.queryByText('Add LootAura to your Home Screen')).toBeNull()
    })
  })
})
