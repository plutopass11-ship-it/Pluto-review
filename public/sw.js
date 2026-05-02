const CACHE_NAME = 'parallax-video-cache-v1';
const VIDEO_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Install: claim clients immediately
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name.startsWith('parallax-video-cache-') && name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: cache videos after first play
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only cache video requests (proxy-video API or direct video URLs)
    const isVideo = 
        url.pathname.includes('/api/proxy-video') ||
        url.pathname.includes('/api/download-watermarked') ||
        request.destination === 'video';

    if (!isVideo || request.method !== 'GET') {
        return; // Let browser handle non-video requests normally
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(request);

            if (cached) {
                // Check if cache is still fresh
                const dateHeader = cached.headers.get('sw-cached-date');
                if (dateHeader) {
                    const cachedTime = parseInt(dateHeader, 10);
                    if (Date.now() - cachedTime < VIDEO_CACHE_MAX_AGE) {
                        return cached;
                    }
                }
                // Stale cache — delete and refetch
                await cache.delete(request);
            }

            // Fetch from network and cache
            try {
                const response = await fetch(request);
                if (response.ok && response.status === 200) {
                    // Clone response before reading body
                    const responseToCache = response.clone();
                    const headers = new Headers(responseToCache.headers);
                    headers.set('sw-cached-date', String(Date.now()));

                    const cachedResponse = new Response(responseToCache.body, {
                        status: responseToCache.status,
                        statusText: responseToCache.statusText,
                        headers,
                    });

                    await cache.put(request, cachedResponse);
                }
                return response;
            } catch (err) {
                // Network failed — return stale cache if available
                if (cached) {
                    return cached;
                }
                throw err;
            }
        })
    );
});
