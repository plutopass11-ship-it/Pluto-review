import { getKitsuToken, getKitsuApiUrl } from '@/lib/kitsu';

/**
 * POST /api/comment/reply
 * Body: { taskId, commentId, text }
 * Posts a reply to an existing Kitsu comment on a task via /data/tasks/{taskId}/comments/{commentId}/reply
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const { taskId, commentId, text } = body;

        if (!taskId) {
            return new Response(JSON.stringify({ error: 'Missing taskId' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        if (!commentId) {
            return new Response(JSON.stringify({ error: 'Missing commentId' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        if (!text || !text.trim()) {
            return new Response(JSON.stringify({ error: 'Missing text content' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const token = await getKitsuToken();

        const replyUrl = `${getKitsuApiUrl()}/data/tasks/${taskId}/comments/${commentId}/reply`;
        
        const res = await fetch(replyUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                text: text.trim()
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            return new Response(JSON.stringify({ error: `Kitsu error: ${res.status}`, detail: errText }), {
                status: res.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await res.json();
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Comment Reply API error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error', detail: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
