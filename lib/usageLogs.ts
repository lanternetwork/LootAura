// Lightweight, opt-in usage logging for testing only
// Safe on SSR; only touches window in the browser

type UsageCounters = {
  mapLoads: number
  geocodeCalls: number
  firstEventAt?: number
  lastEventAt?: number
  _lastLogTs?: Record<string, number>
}

declare global {
  interface Window {
    __laUsage?: UsageCounters
  }
}

function getFlagEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_DEBUG
  if (!raw) return false
  const v = String(raw).toLowerCase().trim()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function ensureStore(): UsageCounters | null {
  if (typeof window === 'undefined') return null
  if (!window.__laUsage) {
    window.__laUsage = {
      mapLoads: 0,
      geocodeCalls: 0,
      firstEventAt: undefined,
      lastEventAt: undefined,
      _lastLogTs: {},
    }
  }
  return window.__laUsage!
}

function debouncedLog(key: string, message: string) {
  if (!getFlagEnabled()) return
  const store = ensureStore()
  if (!store) return

  const now = Date.now()
  const last = store._lastLogTs?.[key] ?? 0
  if (now - last < 500) return
  store._lastLogTs![key] = now
  // One-line message
  // eslint-disable-next-line no-console
  console.log(message)
}

function markTimestamps(store: UsageCounters) {
  const now = Date.now()
  if (!store.firstEventAt) store.firstEventAt = now
  store.lastEventAt = now
}

export function incMapLoad() {
  const store = ensureStore()
  if (!store) return
  store.mapLoads += 1
  markTimestamps(store)
  debouncedLog('mapLoads', `[usage] map load (count=${store.mapLoads})`)
}

export function incGeocodeCall() {
  const store = ensureStore()
  if (!store) return
  store.geocodeCalls += 1
  markTimestamps(store)
  debouncedLog('geocodeCalls', `[usage] geocode call (count=${store.geocodeCalls})`)
}

export function getUsageSnapshot(): UsageCounters | null {
  const store = ensureStore()
  if (!store) return null
  // Shallow copy without private fields for display
  const { mapLoads, geocodeCalls, firstEventAt, lastEventAt } = store
  return { mapLoads, geocodeCalls, firstEventAt, lastEventAt } as UsageCounters
}

export function resetUsage() {
  const store = ensureStore()
  if (!store) return
  store.mapLoads = 0
  store.geocodeCalls = 0
  store.firstEventAt = undefined
  store.lastEventAt = undefined
  store._lastLogTs = {}
}


