import { getKitsuToken, getKitsuApiUrl } from '@/lib/kitsu';

/**
 * GET /api/proxy-thumbnail?id=<preview_file_id>
 * Proxies thumbnail images from Kitsu to avoid cross-origin issues.
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return new Response('Missing preview file id', { status: 400 });
    }

    try {
        const token = await getKitsuToken();
        const thumbnailUrl = `${getKitsuApiUrl()}/pictures/thumbnails/preview-files/${id}.png`;

        const upstream = await fetch(thumbnailUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!upstream.ok) {
            // Return a 1x1 transparent PNG instead of text to avoid broken images
            const transparentPixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
            return new Response(transparentPixel, {
                status: 200,
                headers: {
                    'Content-Type': 'image/png',
                    'Cache-Control': 'public, max-age=86400'
                }
            });
        }

        const responseHeaders = new Headers();
        responseHeaders.set('Content-Type', upstream.headers.get('Content-Type') || 'image/png');
        if (upstream.headers.get('Content-Length')) {
            responseHeaders.set('Content-Length', upstream.headers.get('Content-Length'));
        }
        responseHeaders.set('Cache-Control', 'public, max-age=86400');

        return new Response(upstream.body, {
            status: 200,
            headers: responseHeaders,
        });
    } catch (error) {
        console.error('Thumbnail proxy error:', error);
        return new Response('Thumbnail proxy error', { status: 500 });
    }
}
