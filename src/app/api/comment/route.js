import { getKitsuToken, getKitsuApiUrl, fetchKitsuData } from '@/lib/kitsu';
import { formatUtcDateTime } from '@/lib/datetime';

/**
 * GET /api/comment?taskId=<task_id>
 * Returns comments for a task
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
        const [comments, persons, attachments] = await Promise.all([
            fetchKitsuData(`/data/tasks/${taskId}/comments`),
            fetchKitsuData('/data/persons', false, { next: { revalidate: 300 } }).catch(() => []),
            fetchKitsuData(`/data/tasks/${taskId}/attachment-files`).catch(() => [])
        ]);

        const personsMap = {};
        persons.forEach(p => personsMap[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim());
        const attachmentCountByCommentId = {};
        attachments.forEach((attachment) => {
            if (!attachment.comment_id) return;
            attachmentCountByCommentId[attachment.comment_id] = (attachmentCountByCommentId[attachment.comment_id] || 0) + 1;
        });

        const result = comments
            .filter(c => c.text && c.text.trim())
            .map(c => {
                return {
                    id: c.id,
                    user: personsMap[c.person_id] || 'User',
                    text: c.text,
                    time: formatUtcDateTime(c.created_at),
                    attachmentCount: attachmentCountByCommentId[c.id] || 0
                };
            });

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

/**
 * POST /api/comment
 * Body: { taskId, comment, taskStatusId? }
 * Posts a comment to a Kitsu task via /actions/tasks/{id}/comment.
 * Zou API uses the field name "comment" (not "text") for the comment body.
 * If no taskStatusId is provided, uses the task's current status.
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const { taskId, comment, taskStatusId } = body;

        if (!taskId) {
            return new Response(JSON.stringify({ error: 'Missing taskId' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const token = await getKitsuToken();

        // If no status specified, get the task's current status to keep it unchanged
        let statusId = taskStatusId;
        if (!statusId) {
            const task = await fetchKitsuData(`/data/tasks/${taskId}`);
            statusId = task.task_status_id;
        }

        // Zou uses "comment" field for the text body, NOT "text"
        const payload = {
            task_status_id: statusId,
            comment: comment || ''
        };

        const res = await fetch(`${getKitsuApiUrl()}/actions/tasks/${taskId}/comment`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload),
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
        console.error('Comment API error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error', detail: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
