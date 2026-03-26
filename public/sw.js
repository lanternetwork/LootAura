// Conservative Service Worker for LootAura.
// Dynamic/authenticated marketplace data is intentionally NOT cached.
const STATIC_CACHE = 'lootaura-static-v1'
const STATIC_ASSETS = ['/manifest.webmanifest', '/manifest.json', '/icons/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== STATIC_CACHE)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  )
})

function isStaticAssetRequest(url, request) {
  if (url.origin !== self.location.origin) return false
  if (url.pathname === '/manifest.webmanifest' || url.pathname === '/manifest.json') return true
  if (url.pathname.startsWith('/icons/')) return true
  return ['image', 'style', 'script', 'font'].includes(request.destination)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never cache document navigations, API routes, auth callbacks, or query-bearing URLs.
  if (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    url.pathname.startsWith('/api/') ||
    url.searchParams.has('code') ||
    url.searchParams.has('error') ||
    url.search
  ) {
    return
  }

  if (!isStaticAssetRequest(url, request)) {
    return
  }

  // Network-first for static assets to avoid stale install metadata/icons.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const cloned = response.clone()
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, cloned))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
