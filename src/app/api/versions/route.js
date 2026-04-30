import { fetchKitsuData } from '@/lib/kitsu';

/**
 * GET /api/versions?taskId=<task_id>
 * Returns all preview versions for a task, sorted by revision (newest first)
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
        return new Response(JSON.stringify({ error: 'Missing taskId' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // Get all preview files for this task
        const previews = await fetchKitsuData(`/data/preview-files?task_id=${taskId}`);

        // Flatten if nested (Zou sometimes groups by task_id)
        let allPreviews = [];
        if (Array.isArray(previews)) {
            allPreviews = previews;
        } else if (typeof previews === 'object') {
            // It may be grouped by task_id
            Object.values(previews).forEach(group => {
                if (Array.isArray(group)) allPreviews.push(...group);
            });
        }

        // Sort by revision descending
        allPreviews.sort((a, b) => (b.revision || 0) - (a.revision || 0));

        const result = allPreviews.map(p => ({
            id: p.id,
            revision: p.revision,
            created_at: p.created_at,
            extension: p.extension,
            original_name: p.original_name,
            video_url: `/api/proxy-video?id=${p.id}&ext=${p.extension || 'mp4'}`,
            thumbnail_url: `/api/proxy-thumbnail?id=${p.id}`,
            status: p.status,
            is_playable: (p.status || '').toLowerCase() !== 'processing'
                && (p.status || '').toLowerCase() !== 'broken'
                && Number(p.file_size || 0) > 0
        }));

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
