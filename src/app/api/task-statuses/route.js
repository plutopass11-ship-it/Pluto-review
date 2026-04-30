import { fetchKitsuData } from '@/lib/kitsu';

/**
 * GET /api/task-statuses
 * Returns all available task statuses from Kitsu
 */
export async function GET() {
    try {
        const statuses = await fetchKitsuData('/data/task-status');
        return Response.json(statuses);
    } catch (error) {
        console.error('Task statuses API error:', error);
        return Response.json({ error: 'Failed to fetch task statuses' }, { status: 500 });
    }
}
