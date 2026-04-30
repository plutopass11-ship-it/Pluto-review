import { getKitsuToken, getKitsuApiUrl } from '@/lib/kitsu';

/**
 * GET /api/download-watermarked?id=<preview_file_id>&name=<shot_name>&user=<username>
 * 
 * Since server-side video watermarking requires FFmpeg (not available in Next.js),
 * we redirect to the original video with a download header. 
 * The client-side watermark overlay is always visible during playback.
 * For a production app, this would use a cloud function with FFmpeg to burn in watermarks.
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const previewId = searchParams.get('id');
    const shotName = searchParams.get('name') || 'shot';
    const user = searchParams.get('user') || 'client';
    const ext = searchParams.get('ext') || 'mp4';

    if (!previewId) {
        return new Response(JSON.stringify({ error: 'Missing preview file id' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const token = await getKitsuToken();
        const videoUrl = `${getKitsuApiUrl()}/movies/originals/preview-files/${previewId}.${ext}`;

        const res = await fetch(videoUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!res.ok) {
            return new Response(JSON.stringify({ error: 'Failed to fetch video' }), {
                status: res.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const filename = `${shotName}_${user}_${new Date().toISOString().slice(0, 10)}.${ext}`;

        const contentType = ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4';

        return new Response(res.body, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-cache',
            },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
