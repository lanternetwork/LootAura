import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useState } from 'react'
import { useUserLocationWatch } from '@/lib/hooks/useUserLocationWatch'

const startMock = vi.fn()
const stopMock = vi.fn()

vi.mock('@/lib/map/userLocationWatch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/map/userLocationWatch')>()
  return {
    ...actual,
    canStartUserLocationWatch: () => true,
    startUserLocationWatch: (...args: Parameters<typeof actual.startUserLocationWatch>) =>
      startMock(...args),
  }
})

function WatchHarness({
  enabled,
  onPermissionLost,
}: {
  enabled: boolean
  onPermissionLost?: () => void
}) {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)

  useUserLocationWatch({
    enabled,
    onUpdate: (update) => setLocation({ lat: update.lat, lng: update.lng }),
    onPermissionLost,
  })

  return (
    <div data-testid="loc">
      {location ? `${location.lat},${location.lng}` : 'none'}
    </div>
  )
}

describe('useUserLocationWatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stopMock.mockClear()
    startMock.mockImplementation((callbacks) => ({
      watchId: 1,
      stop: stopMock,
      __callbacks: callbacks,
    }))
  })

  it('starts watch when enabled', () => {
    render(<WatchHarness enabled={true} />)
    expect(startMock).toHaveBeenCalledTimes(1)
  })

  it('does not start watch when disabled', () => {
    render(<WatchHarness enabled={false} />)
    expect(startMock).not.toHaveBeenCalled()
  })

  it('clears watch on unmount', () => {
    const { unmount } = render(<WatchHarness enabled={true} />)
    unmount()
    expect(stopMock).toHaveBeenCalledTimes(1)
  })

  it('updates consumer state on successive watch callbacks', async () => {
    const { getByTestId } = render(<WatchHarness enabled={true} />)
    const callbacks = startMock.mock.calls[0]![0] as {
      onUpdate: (u: { lat: number; lng: number; timestamp: number }) => void
    }

    act(() => {
      callbacks.onUpdate({ lat: 38.1, lng: -85.1, timestamp: Date.now() })
    })
    expect(getByTestId('loc').textContent).toBe('38.1,-85.1')

    act(() => {
      callbacks.onUpdate({ lat: 38.2, lng: -85.2, timestamp: Date.now() })
    })
    expect(getByTestId('loc').textContent).toBe('38.2,-85.2')
  })

  it('stops watch and calls onPermissionLost on PERMISSION_DENIED', () => {
    const onPermissionLost = vi.fn()
    render(<WatchHarness enabled={true} onPermissionLost={onPermissionLost} />)
    const callbacks = startMock.mock.calls[0]![0] as { onError?: (code: number) => void }

    act(() => {
      callbacks.onError?.(1)
    })

    expect(stopMock).toHaveBeenCalled()
    expect(onPermissionLost).toHaveBeenCalledTimes(1)
  })

  it('re-registers watch after disable then enable', () => {
    const { rerender } = render(<WatchHarness enabled={true} />)
    expect(startMock).toHaveBeenCalledTimes(1)

    rerender(<WatchHarness enabled={false} />)
    expect(stopMock).toHaveBeenCalledTimes(1)

    rerender(<WatchHarness enabled={true} />)
    expect(startMock).toHaveBeenCalledTimes(2)
  })
})
