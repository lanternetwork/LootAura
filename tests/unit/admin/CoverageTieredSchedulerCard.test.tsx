import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import CoverageTieredSchedulerCard from '@/app/admin/ingestion/CoverageTieredSchedulerCard'

const API_PATH = '/api/admin/ingestion/coverage-tiered-scheduler'

const disabledState = {
  enabled: false,
  enabledAt: null,
  longTailCursor: 120,
  legacyCursor: 450,
}

const enabledState = {
  enabled: true,
  enabledAt: '2026-06-09T12:00:00.000Z',
  longTailCursor: 200,
  legacyCursor: 450,
}

function mockFetchSequence(handlers: Array<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const handler = handlers.shift()
    if (!handler) {
      throw new Error(`Unexpected fetch: ${String(input)} ${init?.method ?? 'GET'}`)
    }
    return handler(input, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('CoverageTieredSchedulerCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    )
  })

  it('renders disabled state with cursors after load', async () => {
    mockFetchSequence([
      async () =>
        jsonResponse({
          ok: true,
          coverageTieredScheduler: disabledState,
        }),
    ])

    render(<CoverageTieredSchedulerCard />)

    expect(await screen.findByText('OFF')).toBeInTheDocument()
    expect(screen.getByText('450')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enable tiered scheduler' })).toBeInTheDocument()
  })

  it('enables tiered scheduler after confirm and re-fetch', async () => {
    const fetchMock = mockFetchSequence([
      async () =>
        jsonResponse({
          ok: true,
          coverageTieredScheduler: disabledState,
        }),
      async (_input, init) => {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({ enabled: true })
        return jsonResponse({
          ok: true,
          coverageTieredScheduler: enabledState,
        })
      },
      async () =>
        jsonResponse({
          ok: true,
          coverageTieredScheduler: enabledState,
        }),
    ])

    render(<CoverageTieredSchedulerCard />)
    await screen.findByRole('button', { name: 'Enable tiered scheduler' })

    fireEvent.click(screen.getByRole('button', { name: 'Enable tiered scheduler' }))

    await waitFor(() => {
      expect(screen.getByText('ON')).toBeInTheDocument()
    })
    expect(window.confirm).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Disable tiered scheduler' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('disables tiered scheduler without confirm', async () => {
    mockFetchSequence([
      async () =>
        jsonResponse({
          ok: true,
          coverageTieredScheduler: enabledState,
        }),
      async (_input, init) => {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({ enabled: false })
        return jsonResponse({
          ok: true,
          coverageTieredScheduler: {
            ...disabledState,
            legacyCursor: 200,
          },
        })
      },
      async () =>
        jsonResponse({
          ok: true,
          coverageTieredScheduler: {
            ...disabledState,
            legacyCursor: 200,
          },
        }),
    ])

    render(<CoverageTieredSchedulerCard />)
    await screen.findByRole('button', { name: 'Disable tiered scheduler' })

    fireEvent.click(screen.getByRole('button', { name: 'Disable tiered scheduler' }))

    await waitFor(() => {
      expect(screen.getByText('OFF')).toBeInTheDocument()
    })
    expect(window.confirm).not.toHaveBeenCalled()
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  it('shows load error when GET fails', async () => {
    mockFetchSequence([
      async () =>
        jsonResponse(
          {
            ok: false,
            code: 'COVERAGE_TIERED_SCHEDULER_READ_FAILED',
            message: 'column long_tail_cursor does not exist',
          },
          500
        ),
    ])

    render(<CoverageTieredSchedulerCard />)

    expect(
      await screen.findByText(/Failed to load state: column long_tail_cursor does not exist/)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enable tiered scheduler' })).toBeDisabled()
  })

  it('shows mutation error when POST fails', async () => {
    mockFetchSequence([
      async () =>
        jsonResponse({
          ok: true,
          coverageTieredScheduler: disabledState,
        }),
      async () =>
        jsonResponse(
          {
            ok: false,
            code: 'COVERAGE_TIERED_SCHEDULER_TOGGLE_FAILED',
            message: 'update failed',
          },
          500
        ),
    ])

    render(<CoverageTieredSchedulerCard />)
    await screen.findByRole('button', { name: 'Enable tiered scheduler' })

    fireEvent.click(screen.getByRole('button', { name: 'Enable tiered scheduler' }))

    expect(await screen.findByText('update failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enable tiered scheduler' })).not.toBeDisabled()
  })

  it('does not POST when enable confirm is cancelled', async () => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false)
    )
    const fetchMock = mockFetchSequence([
      async () =>
        jsonResponse({
          ok: true,
          coverageTieredScheduler: disabledState,
        }),
    ])

    render(<CoverageTieredSchedulerCard />)
    await screen.findByRole('button', { name: 'Enable tiered scheduler' })

    fireEvent.click(screen.getByRole('button', { name: 'Enable tiered scheduler' }))

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(API_PATH)
  })
})
