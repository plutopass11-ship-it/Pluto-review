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

/**
 * Create a Response slice for Range requests from a full cached Response
 */
async function createRangeResponse(fullResponse, rangeHeader) {
    const blob = await fullResponse.blob();
    const totalLength = blob.size;

    // Parse Range header (e.g., "bytes=0-1023" or "bytes=1024-")
    const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (!rangeMatch) return null;

    let start = parseInt(rangeMatch[1], 10);
    let end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : totalLength - 1;

    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end)) end = totalLength - 1;
    if (start >= totalLength || end >= totalLength) {
        // Requested range not satisfiable
        return new Response(null, {
            status: 416,
            statusText: 'Range Not Satisfiable',
            headers: {
                'Content-Range': `bytes */${totalLength}`,
            },
        });
    }

    const slicedBlob = blob.slice(start, end + 1);
    const headers = new Headers(fullResponse.headers);
    headers.set('Content-Range', `bytes ${start}-${end}/${totalLength}`);
    headers.set('Content-Length', String(slicedBlob.size));
    headers.set('Accept-Ranges', 'bytes');

    return new Response(slicedBlob, {
        status: 206,
        statusText: 'Partial Content',
        headers,
    });
}

/**
 * Check if a cached response is still fresh
 */
function isCacheFresh(cachedResponse) {
    const dateHeader = cachedResponse.headers.get('sw-cached-date');
    if (!dateHeader) return false;
    const cachedTime = parseInt(dateHeader, 10);
    return Date.now() - cachedTime < VIDEO_CACHE_MAX_AGE;
}

// Fetch: cache videos after first play, handle Range requests
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

    const rangeHeader = request.headers.get('Range');

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Try to find a cached full response (strip Range header for matching)
            const cacheKey = new Request(url.toString(), { method: 'GET' });
            const cached = await cache.match(cacheKey);

            // If we have a fresh cached full response
            if (cached && isCacheFresh(cached)) {
                // If this is a Range request, serve a slice from cache
                if (rangeHeader) {
                    const rangeResponse = await createRangeResponse(cached, rangeHeader);
                    if (rangeResponse) return rangeResponse;
                }
                // Not a Range request or slice failed — return full cached response
                return cached;
            }

            // Stale or missing cache — delete if stale
            if (cached) {
                await cache.delete(cacheKey);
            }

            // If this is a Range request and we don't have cache, 
            // let browser fetch from network (don't try to cache partial responses)
            if (rangeHeader) {
                return fetch(request);
            }

            // Fetch full video from network and cache it
            try {
                const response = await fetch(request);
                if (response.ok && (response.status === 200 || response.status === 206)) {
                    // Clone and cache the full response
                    const responseToCache = response.clone();
                    const headers = new Headers(responseToCache.headers);
                    headers.set('sw-cached-date', String(Date.now()));

                    // If it's a 206, we should ideally fetch the full file.
                    // For now, cache what we got. Next time a Range request comes in,
                    // if this was a 206 it might not have full data. But for preload=auto
                    // the first request is usually a 200 for the full file.
                    const cachedResponse = new Response(responseToCache.body, {
                        status: responseToCache.status,
                        statusText: responseToCache.statusText,
                        headers,
                    });

                    await cache.put(cacheKey, cachedResponse);
                }
                return response;
            } catch (err) {
                // Network failed — return stale cache as fallback even if expired
                if (cached) {
                    if (rangeHeader) {
                        const rangeResponse = await createRangeResponse(cached, rangeHeader);
                        if (rangeResponse) return rangeResponse;
                    }
                    return cached;
                }
                throw err;
            }
        })
    );
});
