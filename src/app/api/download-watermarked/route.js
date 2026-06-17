import { getKitsuToken, getKitsuApiUrl } from '@/lib/kitsu';
import { logDownload } from '@/lib/download-logger';

/**
 * GET /api/download-watermarked?id=<preview_file_id>&name=<shot_name>&user=<username>&projectId=<id>&projectName=<name>&sequenceName=<seq>&type=<type>
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
    const projectId = searchParams.get('projectId') || 'unknown';
    const projectName = searchParams.get('projectName') || 'Unknown Project';
    const sequenceName = searchParams.get('sequenceName') || null;
    const type = searchParams.get('type') || 'shot';

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

        // Log the download (fire and forget)
        const headers = Object.fromEntries(request.headers.entries());
        logDownload({
            ip: headers['x-forwarded-for']?.split(',')[0] || headers['x-real-ip'] || 'unknown',
            userAgent: headers['user-agent'],
            projectId,
            projectName,
            sequenceName,
            shotName,
            type,
            fileName: filename,
            username: user,

        }).catch(() => {});

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
