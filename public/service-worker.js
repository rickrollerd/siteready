const CACHE_VERSION = 'v2';
const CACHE_NAME = `siteready-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Static assets that should be cached on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/mobile.css',
  '/manifest.json',
  '/offline.html',
  '/icon-72x72.png',
  '/icon-96x96.png',
  '/icon-128x128.png',
  '/icon-144x144.png',
  '/icon-152x152.png',
  '/icon-192x192.png',
  '/icon-384x384.png',
  '/icon-512x512.png',
  '/icon-512-maskable.png',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/safari-pinned-tab.svg'
];

// Assets that should be cached but can be updated in background
const DYNAMIC_ASSETS = [
  '/api/swms'  // API responses that can be cached with network-first strategy
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log(`[Service Worker] Caching ${STATIC_ASSETS.length} static assets`);
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Installation complete, skipping waiting');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[Service Worker] Installation failed:', error);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old caches that don't match current version
          if (!cacheName.startsWith('siteready-') || cacheName !== CACHE_NAME) {
            console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[Service Worker] Activation complete, claiming clients');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  
  // Skip non-GET requests and browser extensions
  if (request.method !== 'GET' || request.url.startsWith('chrome-extension://')) {
    return;
  }

  // Strategy selection based on request type
  if (request.mode === 'navigate' || STATIC_ASSETS.some(asset => request.url.includes(asset))) {
    // For navigation and static assets: Cache First, Network Fallback
    event.respondWith(cacheFirstWithNetworkFallback(request));
  } else if (DYNAMIC_ASSETS.some(asset => request.url.includes(asset))) {
    // For dynamic assets: Network First, Cache Fallback
    event.respondWith(networkFirstWithCacheFallback(request));
  } else {
    // For everything else: Stale-While-Revalidate
    event.respondWith(staleWhileRevalidate(request));
  }
});

// Cache First with Network Fallback (for static assets)
async function cacheFirstWithNetworkFallback(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    // Return cached response but update cache in background
    fetchAndCache(request, cache).catch(() => {}); // Silent background update
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // If navigation request fails, show offline page
    if (request.mode === 'navigate') {
      const offlineResponse = await cache.match(OFFLINE_URL);
      if (offlineResponse) return offlineResponse;
    }
    throw error;
  }
}

// Network First with Cache Fallback (for dynamic API data)
async function networkFirstWithCacheFallback(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Stale-While-Revalidate (for other resources)
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Always try to fetch and update cache in background
  const fetchPromise = fetchAndCache(request, cache);
  
  if (cachedResponse) {
    // Return cached immediately, update in background
    fetchPromise.catch(() => {}); // Ignore background fetch errors
    return cachedResponse;
  }
  
  // No cache, wait for network
  return fetchPromise;
}

// Helper: Fetch and cache response
async function fetchAndCache(request, cache) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn(`[Service Worker] Failed to fetch ${request.url}:`, error);
    throw error;
  }
}

// Background sync for failed POST requests (future enhancement)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-swms') {
    console.log('[Service Worker] Background sync triggered');
    // Could retry failed API submissions here
  }
});