// Service Worker for LootAura PWA
// const CACHE_NAME = 'yardsalefinder-v1'
const STATIC_CACHE = 'static-v3' // Force cache update
const DYNAMIC_CACHE = 'dynamic-v3' // Force cache update

// Files to cache for offline use
// NOTE: Removed '/' from cache to prevent OAuth callback interference
const STATIC_FILES = [
  '/explore',
  '/favorites',
  '/signin',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
]

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...')
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Caching static files')
        return cache.addAll(STATIC_FILES)
      })
      .then(() => {
        console.log('Static files cached')
        return self.skipWaiting()
      })
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...')
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE
            })
            .map((cacheName) => {
              console.log('Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            })
        )
      })
      .then(() => {
        console.log('Service Worker activated')
        return self.clients.claim()
      })
  )
})

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // CRITICAL: Skip OAuth callback URLs to prevent caching interference
  if (url.searchParams.has('code') || url.searchParams.has('error')) {
    console.log('🚨 OAuth callback detected, skipping service worker cache:', url.href)
    console.log('🚨 Service worker version:', STATIC_CACHE)
    return // Let the request go through normally without caching
  }

  // Block Mapbox telemetry requests
  if (url.hostname === 'events.mapbox.com') {
    console.log('Blocking Mapbox telemetry request:', url.href)
    event.respondWith(new Response(null, { status: 204 }))
    return
  }

  // Skip external requests (except our API)
  if (url.origin !== location.origin && !url.pathname.startsWith('/api/')) {
    return
  }

  // Skip external resources - validate hostname properly
  const allowedExternalHosts = ['googleapis.com', 'fonts.googleapis.com', 'fonts.gstatic.com']
  if (allowedExternalHosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) {
    return
  }

  // Network-first strategy for manifest and icons to allow updates
  if (url.pathname === '/manifest.webmanifest' || 
      url.pathname === '/manifest.json' ||
      url.pathname.startsWith('/icons/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful responses for offline fallback
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone()
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseToCache)
            })
          }
          return response
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request)
        })
    )
    return
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          console.log('Serving from cache:', request.url)
          return cachedResponse
        }

        // Otherwise fetch from network
        return fetch(request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response
            }

            // Clone the response for caching
            const responseToCache = response.clone()

            // Cache dynamic content
            caches.open(DYNAMIC_CACHE)
              .then((cache) => {
                cache.put(request, responseToCache)
              })

            return response
          })
          .catch((error) => {
            console.log('Fetch failed:', error)
            
            // Return offline page for navigation requests
            if (request.destination === 'document') {
              return caches.match('/')
            }
            
            throw error
          })
      })
  )
})

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Background sync:', event.tag)
  
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Handle offline actions when back online
      handleBackgroundSync()
    )
  }
})

// Push notifications
self.addEventListener('push', (event) => {
  console.log('Push received:', event)
  
  const options = {
    body: event.data ? event.data.text() : 'New yard sale available!',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'View Sales',
        icon: '/icons/icon-192.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icons/icon-192.png'
      }
    ]
  }

  event.waitUntil(
    self.registration.showNotification('LootAura', options)
  )
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event)
  
  event.notification.close()

  if (event.action === 'explore') {
    event.waitUntil(
      self.clients.openWindow('/explore')
    )
  }
})

// Handle background sync
async function handleBackgroundSync() {
  try {
    // Get offline actions from IndexedDB
    const offlineActions = await getOfflineActions()
    
    for (const action of offlineActions) {
      try {
        await processOfflineAction(action)
        await removeOfflineAction(action.id)
      } catch (error) {
        console.error('Failed to process offline action:', error)
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error)
  }
}

// IndexedDB helpers for offline storage
function getOfflineActions() {
  return new Promise((resolve) => {
    const request = indexedDB.open('LootAura', 1)
    
    request.onsuccess = (event) => {
      const db = event.target.result
      const transaction = db.transaction(['offlineActions'], 'readonly')
      const store = transaction.objectStore('offlineActions')
      const getAllRequest = store.getAll()
      
      getAllRequest.onsuccess = () => {
        resolve(getAllRequest.result)
      }
    }
    
    request.onerror = () => {
      resolve([])
    }
  })
}

function removeOfflineAction(id) {
  return new Promise((resolve) => {
    const request = indexedDB.open('LootAura', 1)
    
    request.onsuccess = (event) => {
      const db = event.target.result
      const transaction = db.transaction(['offlineActions'], 'readwrite')
      const store = transaction.objectStore('offlineActions')
      store.delete(id)
      resolve()
    }
  })
}

async function processOfflineAction(action) {
  // Process offline actions when back online
  // This would sync any offline changes to the server
  console.log('Processing offline action:', action)
}
