import { getKitsuToken, getKitsuApiUrl } from '@/lib/kitsu';

/**
 * Video Proxy API Route
 * Streams video content from the Kitsu server through Next.js
 * to avoid cross-origin issues in the browser.
 * 
 * Usage: /api/proxy-video?id=<preview_file_id>&ext=<extension>
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const ext = searchParams.get('ext') || 'mp4';

    if (!id) {
        return new Response('Missing preview file id', { status: 400 });
    }

    try {
        const token = await getKitsuToken();
        // Kitsu Zou serves videos through /api/movies/ not /pictures/
        const videoUrl = `${getKitsuApiUrl()}/movies/originals/preview-files/${id}.${ext}`;

        // Support range requests for video seeking
        const headers = {
            'Authorization': `Bearer ${token}`,
        };

        const rangeHeader = request.headers.get('range');
        if (rangeHeader) {
            headers['Range'] = rangeHeader;
        }

        const upstream = await fetch(videoUrl, { headers });

        if (!upstream.ok && upstream.status !== 206) {
            if (upstream.status === 404) {
                try {
                    const previewRes = await fetch(`${getKitsuApiUrl()}/data/preview-files/${id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (previewRes.ok) {
                        const preview = await previewRes.json();
                        const status = (preview.status || '').toLowerCase();
                        if (status === 'processing' || Number(preview.file_size || 0) === 0) {
                            return new Response('Preview is still processing in Kitsu', { status: 409 });
                        }
                    }
                } catch {}
            }
            return new Response(`Failed to fetch video: ${upstream.status}`, { status: upstream.status });
        }

        // Forward the response with appropriate headers
        const responseHeaders = new Headers();
        responseHeaders.set('Content-Type', upstream.headers.get('Content-Type') || 'video/mp4');

        if (upstream.headers.get('Content-Length')) {
            responseHeaders.set('Content-Length', upstream.headers.get('Content-Length'));
        }
        if (upstream.headers.get('Content-Range')) {
            responseHeaders.set('Content-Range', upstream.headers.get('Content-Range'));
        }
        if (upstream.headers.get('Accept-Ranges')) {
            responseHeaders.set('Accept-Ranges', upstream.headers.get('Accept-Ranges'));
        }

        // Allow the browser to cache the video
        responseHeaders.set('Cache-Control', 'public, max-age=3600');

        return new Response(upstream.body, {
            status: upstream.status,
            headers: responseHeaders,
        });
    } catch (error) {
        console.error('Video proxy error:', error);
        return new Response('Video proxy error', { status: 500 });
    }
}
